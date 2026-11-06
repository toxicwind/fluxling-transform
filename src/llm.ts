/**
 * fluxling-transform llm — agentic LLM layer (file + project prompts).
 *
 * Full Bun/TS port of the original's call_llm_for_diff / call_llm_for_apply,
 * with properly-engineered agentic prompts for BOTH single-file and whole
 * project transformations. Routes through the estate router (rhodochrosite
 * :25193) with kryptos SSOT — no direct provider calls.
 */
import type { Files } from "./core.ts";

const ROUTER_URL = process.env.FLUXLING_ROUTER_URL ?? "http://127.0.0.1:25193/v1";

export interface LlmOptions {
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Resolve the router key from env or kryptos keyring. */
export async function getKey(): Promise<string> {
  const env = process.env.RHODOCHROSITE_API_KEY ?? process.env.FREEINFERENCE_API_KEY;
  if (env) return env;
  const { execFile } = await import("node:child_process");
  const value = await new Promise<string | undefined>((resolve) => {
    execFile("kryptos", ["--json", "get", "RHODOCHROSITE_API_KEY", "--no-fuzzy"], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve(undefined);
      try {
        const parsed = JSON.parse(stdout);
        const secret = parsed?.secret ?? parsed?.value ?? parsed;
        resolve(typeof secret === "string" && secret ? secret : undefined);
      } catch {
        resolve(undefined);
      }
    });
  });
  if (!value) throw new Error("fluxling-transform: no RHODOCHROSITE_API_KEY (env or kryptos)");
  return value;
}

/** One chat-completion call through the router. */
export async function chat(messages: Array<{ role: string; content: string }>, opts: LlmOptions = {}): Promise<string> {
  const key = opts.apiKey ?? (await getKey());
  const model = opts.model ?? process.env.GPTDIFF_MODEL ?? "qwen3.6-35b";
  const res = await fetch(`${ROUTER_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: `freeinference/${model}`,
      messages,
      temperature: opts.temperature ?? 1.0,
      max_tokens: opts.maxTokens ?? 32000,
    }),
  });
  if (!res.ok) throw new Error(`router HTTP ${res.status}`);
  const doc = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = doc.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("empty LLM response");
  return text;
}

/** Project-level system prompt: generate a full unified diff for a goal. */
export function projectSystemPrompt(prepend = ""): string {
  return (
    prepend +
    `You are an expert software engineer applying a single change across a project.

OUTPUT FORMAT
Output a full unified git diff into a \`\`\`diff block. One diff per file, using
standard git diff headers:

\`\`\`diff
diff --git a/<path> b/<path>
--- a/<path>
+++ b/<path>
@@ -<start>,<count> +<start>,<count> @@
 <context line>
-<removed line>
+<added line>
\`\`\`

RULES
1. Make the MINIMAL change that satisfies the goal — do not refactor unrelated code.
2. NEVER remove or rename existing functions/classes unless the goal requires it.
3. Context lines must be copied EXACTLY from the provided file content.
4. Preserve the file's existing style, indentation, and conventions.
5. If the goal is ambiguous, prefer the least surprising interpretation.
6. Only output the diff block — no explanation, no commentary, no markdown around it.`
  );
}

/** Project-level user prompt: environment + goal. */
export function projectUserPrompt(environment: string, goal: string): string {
  return `FILES (current content):
${environment}

GOAL:
${goal}

Generate the unified diff that implements this goal.`;
}

/** File-level system prompt: apply a diff to one file (conflict resolution). */
export function fileSystemPrompt(): string {
  return `You are applying a unified diff to a single file.

You are given the file's ORIGINAL content and a DIFF. Apply the diff precisely:

1. Apply every change from the diff (additions, removals, context).
2. Preserve all surrounding context that the diff does not change.
3. Output the COMPLETE resulting file — not a diff, not a fragment.
4. If the diff is malformed or cannot apply, reproduce the original file unchanged.
5. Only output the file content — no explanation, no markdown fences.`;
}

/** File-level user prompt: original content + diff. */
export function fileUserPrompt(filePath: string, original: string, diff: string): string {
  return `FILE: ${filePath}

ORIGINAL CONTENT:
${original}

DIFF TO APPLY:
${diff}

Output the complete file after applying the diff.`;
}

/** Generate a project-level diff from environment + goal. */
export async function generateDiff(
  environment: string,
  goal: string,
  opts: LlmOptions = {},
  prepend = "",
): Promise<string> {
  const raw = await chat(
    [
      { role: "system", content: projectSystemPrompt(prepend) },
      { role: "user", content: projectUserPrompt(environment, goal) },
    ],
    opts,
  );
  return extractDiffBlock(raw);
}

/** Apply a diff to one file via the LLM (conflict resolution). */
export async function llmApplyFile(filePath: string, original: string, diff: string, opts: LlmOptions = {}): Promise<string> {
  return chat(
    [
      { role: "system", content: fileSystemPrompt() },
      { role: "user", content: fileUserPrompt(filePath, original, diff) },
    ],
    opts,
  );
}

/** Extract a diff block from an LLM response. */
export function extractDiffBlock(text: string): string {
  const fence = text.match(/```diff\n([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const bare = text.match(/(^--- .*\n.*\n@@.*)/m);
  return bare ? bare[1].trim() : text.trim();
}

/** Build a project environment string (file excerpts) for generateDiff. */
export function buildEnvironment(files: Files, maxPerFile = 12000): string {
  return Object.entries(files)
    .map(([name, content]) => `FILE ${name}:\n\`\`\`\n${content.slice(0, maxPerFile)}\n\`\`\``)
    .join("\n\n");
}