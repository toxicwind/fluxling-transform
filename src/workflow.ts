/**
 * fluxling-transform workflow — universal patch workflows (code-run-first).
 * Port of fluxling/workflows.py to Bun/TS, modularized. Fixes the original's
 * secretsmith key resolution to kryptos (estate SSOT).
 */
import { spawnSync } from "node:child_process";
import type { Files } from "./core.ts";
import { applyDiff } from "./applydiff.ts";
import { chat } from "./llm.ts";

export interface CheckResult {
  check: string;
  cmd: string;
  ok: boolean;
  exit: number;
  stdoutTail: string;
  stderrTail: string;
}

export interface WorkflowResult {
  satisfied: boolean;
  rounds: number;
  applied?: boolean;
  error?: string;
  history: Array<Record<string, unknown>>;
}

/** Run verification commands in workdir; all must pass (exit 0). */
export async function runChecks(workdir: string, checks: Array<[string, string[]]>, timeoutMs = 120_000): Promise<[boolean, CheckResult[]]> {
  const results: CheckResult[] = [];
  let allOk = true;
  for (const [name, cmd] of checks) {
    let ok = false;
    let exit = -1;
    let stdoutTail = "";
    let stderrTail = "";
    try {
      const r = spawnSync(cmd[0], cmd.slice(1), { cwd: workdir, encoding: "utf8", timeout: timeoutMs });
      ok = r.status === 0;
      exit = r.status ?? -1;
      stdoutTail = (r.stdout ?? "").slice(-2000);
      stderrTail = (r.stderr ?? "").slice(-2000);
    } catch (e) {
      stderrTail = `timed out after ${timeoutMs}ms: ${(e as Error).message}`;
    }
    results.push({ check: name, cmd: cmd.join(" "), ok, exit, stdoutTail, stderrTail });
    if (!ok) allOk = false;
  }
  return [allOk, results];
}

const DIFF_SYSTEM_PROMPT =
  "You are a code patch generator. Given a goal and the failing state, output ONLY a " +
  "unified diff (git format, a/ b/ prefixes) that accomplishes the goal. No prose, no " +
  "markdown fences, no explanations. Keep patches minimal and surgical.";

const REPAIR_SYSTEM_PROMPT =
  "You are a code patch generator. Your previous patch was applied but the verification " +
  "checks FAILED. Fix the code so all checks pass. Output ONLY a unified diff against the " +
  "CURRENT file state. No prose, no markdown fences.";

/** CODE-RUN-FIRST patch workflow: model proposes diff → apply → verify, iterate. */
export async function verifyApply(
  goal: string,
  workdir: string,
  checks: Array<[string, string[]]>,
  opts: { maxRounds?: number; model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<WorkflowResult> {
  const { maxRounds = 3, model = "qwen3.6-35b", maxTokens = 4000, temperature = 0.2 } = opts;
  const history: Array<Record<string, unknown>> = [];
  let lastFailure = "";
  for (let roundNo = 1; roundNo <= maxRounds; roundNo++) {
    const sysmsg = { role: "system", content: roundNo === 1 ? DIFF_SYSTEM_PROMPT : REPAIR_SYSTEM_PROMPT };
    const userParts = [`GOAL: ${goal}`, `WORKDIR: ${workdir}`];
    if (lastFailure) userParts.push(`PREVIOUS ROUND FAILED VERIFICATION:\n${lastFailure}`);
    let diff: string;
    try {
      diff = await chat(
        [sysmsg, { role: "user", content: userParts.join("\n\n") }],
        { model, maxTokens, temperature },
      );
    } catch (e) {
      return { satisfied: false, rounds: roundNo, error: `model lane failed: ${(e as Error).message}`, history };
    }
    diff = diff.trim();
    if (diff.startsWith("```")) {
      diff = diff.split("\n").slice(1, -1).join("\n").trim();
    }
    let applied: boolean;
    try {
      applied = applyDiff(workdir, diff);
    } catch (e) {
      history.push({ round: roundNo, applied: false, applyError: (e as Error).message.slice(0, 400) });
      lastFailure = `patch could not be applied: ${(e as Error).message}`;
      continue;
    }
    const [checksOk, checkResults] = await runChecks(workdir, checks);
    history.push({ round: roundNo, applied: Boolean(applied), checks: checkResults });
    if (checksOk && applied) {
      return { satisfied: true, rounds: roundNo, applied: true, history };
    }
    const failing = checkResults.filter((c) => !c.ok);
    lastFailure = failing
      .map((c) => `$ ${c.cmd} (exit ${c.exit})\nstdout:\n${c.stdoutTail.slice(-800)}\nstderr:\n${c.stderrTail.slice(-800)}`)
      .join("\n");
  }
  return { satisfied: false, rounds: maxRounds, history, error: `verification still failing after ${maxRounds} rounds` };
}