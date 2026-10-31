"""fluxling.workflows — universal patch workflows: propose -> apply -> verify, code-run-first.

Doctrine (2026-10-31):
- CODE PROVES; the model advises. A workflow is never satisfied by model assertion.
- smartapply auto-detects per-file structure (fuzzy apply) — universal across languages.
- Model output is untrusted: path guards (applydiff.UnsafePathError) always on.
- Verify with real subprocess runs; iterate on failure; never declare success without a passing check.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from typing import Any, Callable, Dict, List, Optional, Tuple

from fluxling.applydiff import apply_diff
from fluxling.core import call_llm

BASE_URL = "https://freeinference.org/v1"
UA_NOTE = "Cloudflare UA wall (anomaly #14) is handled by the HTTP client below."
DEFAULT_MODEL = "qwen3.6-35b"


def get_freeinference_key() -> str:
    """Key from env, else secretsmith keyring."""
    import os

    env = os.environ.get("FREEINFERENCE_API_KEY")
    if env and env.strip():
        return env.strip()
    proc = subprocess.run(
        ["secretsmith", "get", "--label", "FREEINFERENCE_API_KEY"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    import re

    m = re.search(r"secret: (\S+)", proc.stdout)
    if not m:
        raise RuntimeError("no FREEINFERENCE_API_KEY in env or keyring")
    return m.group(1)


def chat(messages, model=DEFAULT_MODEL, max_tokens=4000, temperature=0.2, **_):
    """One freeinference/Qwen completion via fluxling's call_llm. Returns (text, usage)."""
    key = get_freeinference_key()
    resp: Any = call_llm(key, BASE_URL, model, messages, max_tokens, temperature)
    if not hasattr(resp, "choices"):
        raise RuntimeError(f"model lane error: {str(resp)[:300]}")
    text = resp.choices[0].message.content or ""
    usage = getattr(resp, "usage", {})
    usage = usage.__dict__ if hasattr(usage, "__dict__") else {}
    return text.strip(), usage


DIFF_SYSTEM_PROMPT = (
    "You are a code patch generator. Given a goal and the failing state, output ONLY a "
    "unified diff (git format, a/ b/ prefixes) that accomplishes the goal. No prose, no "
    "markdown fences, no explanations. Keep patches minimal and surgical."
)

REPAIR_SYSTEM_PROMPT = (
    "You are a code patch generator. Your previous patch was applied but the verification "
    "checks FAILED. Fix the code so all checks pass. Output ONLY a unified diff against the "
    "CURRENT file state. No prose, no markdown fences."
)


def run_checks(
    workdir: str, checks: List[Tuple[str, List[str]]], timeout: int = 120
) -> Tuple[bool, List[Dict[str, Any]]]:
    """Run verification commands in workdir. All must pass (exit 0) for satisfaction."""
    results = []
    all_ok = True
    for name, cmd in checks:
        ok = False
        try:
            proc = subprocess.run(
                cmd, cwd=workdir, capture_output=True, text=True, timeout=timeout
            )
            ok = proc.returncode == 0
            results.append(
                {
                    "check": name,
                    "cmd": " ".join(cmd),
                    "ok": ok,
                    "exit": proc.returncode,
                    "stdout_tail": proc.stdout[-2000:],
                    "stderr_tail": proc.stderr[-2000:],
                }
            )
        except subprocess.TimeoutExpired:
            all_ok = False
            results.append(
                {
                    "check": name,
                    "cmd": " ".join(cmd),
                    "ok": False,
                    "exit": -1,
                    "stdout_tail": "",
                    "stderr_tail": f"timed out after {timeout}s",
                }
            )
        if not ok:
            all_ok = False
    return all_ok, results


def verify_apply(
    goal: str,
    workdir: str,
    checks: List[Tuple[str, List[str]]],
    max_rounds: int = 3,
    model: str = "qwen3.6-35b",
    max_tokens: int = 4000,
    temperature: float = 0.2,
    chat_fn: Optional[Callable] = None,
    apply_fn: Optional[Callable] = None,
    checks_fn: Optional[Callable] = None,
) -> Dict[str, Any]:
    """CODE-RUN-FIRST patch workflow: model proposes diff -> smartapply applies -> code verifies.

    Satisfied only when a diff was actually applied AND every check passed.
    Model verdicts/concerns are advisory; exit codes decide.
    """
    chat_impl = chat_fn or chat
    apply_impl = apply_fn or apply_diff
    checks_impl = checks_fn or run_checks

    history: List[Dict[str, Any]] = []
    last_failure = ""
    for round_no in range(1, max_rounds + 1):
        sysmsg = {
            "role": "system",
            "content": DIFF_SYSTEM_PROMPT if round_no == 1 else REPAIR_SYSTEM_PROMPT,
        }
        user_parts = [f"GOAL: {goal}", f"WORKDIR: {workdir}"]
        if last_failure:
            user_parts.append(f"PREVIOUS ROUND FAILED VERIFICATION:\n{last_failure}")
        messages = [sysmsg, {"role": "user", "content": "\n\n".join(user_parts)}]
        try:
            diff, usage = chat_impl(
                messages, model=model, max_tokens=max_tokens, temperature=temperature
            )
        except Exception as e:
            return {
                "satisfied": False,
                "rounds": round_no,
                "error": f"model lane failed: {e}",
                "history": history,
            }
        diff = diff.strip()
        if diff.startswith("```"):
            # model ignored the no-fence instruction; strip fences
            diff = "\n".join(diff.splitlines()[1:-1]).strip()
        try:
            applied = apply_impl(workdir, diff)
        except Exception as e:
            history.append(
                {"round": round_no, "applied": False, "apply_error": str(e)[:400]}
            )
            last_failure = f"patch could not be applied: {e}"
            continue
        checks_ok, check_results = checks_impl(workdir, checks)
        history.append(
            {"round": round_no, "applied": bool(applied), "checks": check_results}
        )
        if checks_ok and applied:
            return {
                "satisfied": True,
                "rounds": round_no,
                "applied": True,
                "history": history,
            }
        failing = [c for c in check_results if not c["ok"]]
        last_failure = "\n".join(
            f"$ {c['cmd']} (exit {c['exit']})\nstdout:\n{c['stdout_tail'][-800:]}\nstderr:\n{c['stderr_tail'][-800:]}"
            for c in failing
        )
    return {
        "satisfied": False,
        "rounds": max_rounds,
        "history": history,
        "error": f"verification still failing after {max_rounds} rounds",
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="fluxling-workflow",
        description="universal patch workflows (code-run-first)",
    )
    sub = parser.add_subparsers(dest="workflow", required=True)
    va = sub.add_parser(
        "verify-apply",
        help="propose -> smartapply -> verify, iterate until checks pass",
    )
    va.add_argument("--goal", required=True)
    va.add_argument("--workdir", required=True)
    va.add_argument(
        "--check",
        action="append",
        required=True,
        metavar="NAME=CMD",
        help="verification command, e.g. --check 'tests=python -m pytest -q' (repeatable)",
    )
    va.add_argument("--max-rounds", type=int, default=3)
    va.add_argument("--model", default="qwen3.6-35b")
    args = parser.parse_args(argv)
    try:
        get_freeinference_key()
    except Exception:
        print("no FREEINFERENCE_API_KEY — inject via secretsmith env", file=sys.stderr)
        return 2
    checks: List[Tuple[str, List[str]]] = []
    for spec in args.check:
        name, _, cmd = spec.partition("=")
        checks.append((name, cmd.split()))
    result = verify_apply(
        args.goal, args.workdir, checks, max_rounds=args.max_rounds, model=args.model
    )
    print(json.dumps(result, indent=2))
    return 0 if result.get("satisfied") else 1


if __name__ == "__main__":
    sys.exit(main())
