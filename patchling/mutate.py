"""Offline deterministic code mutation (codeflux fork improvement).

Rule-based source transforms that produce unified diffs — no LLM, no API key,
no network. Powers synthetic streams (demos, tests, pipelines) and gives
patchling a fully offline mode.

Deterministic given ``(rule, seed)``: the same seed always yields the same
mutation. Each step mutates exactly one Python file.

Example:
    >>> from patchling.mutate import mutate_diff
    >>> goal, diff = mutate_diff({"app.py": "def hello():\\n    pass\\n"}, seed=3)
    >>> print(goal)
"""
from __future__ import annotations

import difflib
import random
import re
from typing import Callable


def _diff(path: str, old: str, new: str) -> str:
    return "".join(difflib.unified_diff(
        old.splitlines(keepends=True), new.splitlines(keepends=True),
        fromfile="a/" + path, tofile="b/" + path))


def _rename_function(src: str, rng: random.Random):
    m = re.search(r"^def (\w+)\(", src, re.M)
    if not m:
        return None
    old = m.group(1)
    new = f"{old}_v{rng.randint(2, 9)}"
    return src.replace(f"def {old}(", f"def {new}(", 1), f"Rename {old} to {new}"


def _add_docstring(src: str, rng: random.Random):
    m = re.search(r"^(def \w+\(.*\):\n)", src, re.M)
    if not m:
        return None
    head_end = m.end()
    if '"""' in src[head_end:head_end + 120]:
        return None
    doc = '    """Synthetic docstring added by codeflux mutation."""\n'
    return src[:head_end] + doc + src[head_end:], "Add docstring to first function"


def _insert_logging(src: str, rng: random.Random):
    m = re.search(r"^(def \w+\(.*\):\n)", src, re.M)
    if not m:
        return None
    probe = '    print("[codeflux] mutation probe")\n'
    return src[:m.end()] + probe + src[m.end():], "Insert logging probe in first function"


def _bump_constant(src: str, rng: random.Random):
    m = re.search(r"^([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*$", src, re.M)
    if not m:
        return None
    name, val = m.group(1), int(m.group(2))
    new = src[:m.start(2)] + str(val + 1) + src[m.end(2):]
    return new, f"Bump {name} from {val} to {val + 1}"


def _add_function(src: str, rng: random.Random):
    name = f"mutated_helper_{rng.randint(100, 999)}"
    add = (f"\n\ndef {name}():\n"
           f'    """Synthetic helper added by codeflux mutation."""\n'
           f"    return {rng.randint(1, 99)}\n")
    return src.rstrip("\n") + "\n" + add, f"Add helper function {name}"


RULES: list[Callable] = [_rename_function, _add_docstring, _insert_logging,
                         _bump_constant, _add_function]
RULE_NAMES = [fn.__name__.lstrip("_") for fn in RULES]


def _mutate_one(files: dict[str, str], rule: str | None, seed: int):
    """Return (goal, path, new_source) or None when no rule applies."""
    rng = random.Random(seed)
    py = sorted(p for p in files if p.endswith(".py")) or sorted(files)
    if not py:
        return None
    path = rng.choice(py)
    src = files[path]
    if rule is not None:
        fns = [fn for fn in RULES if fn.__name__.lstrip("_") == rule]
    else:
        fns = list(RULES)
        rng.shuffle(fns)
    for fn in fns:
        try:
            res = fn(src, rng)
        except Exception:
            res = None
        if res:
            new_src, goal = res
            if new_src != src:
                return goal, path, new_src
    return None


def mutate_diff(files: dict[str, str], rule: str | None = None, seed: int = 0):
    """Return ``(goal, unified_diff)`` for one deterministic mutation.

    Returns ``(None, None)`` when no rule applies to the given files.
    """
    r = _mutate_one(files, rule, seed)
    if not r:
        return None, None
    goal, path, new_src = r
    return goal, _diff(path, files[path], new_src)


def mutate_stream(files: dict[str, str], n: int = 5, seed: int = 0):
    """Yield chained mutation steps: each applies to the previous result.

    Yields dicts ``{"goal", "path", "diff", "files"}`` where ``files`` is the
    full updated file map after the step.
    """
    cur = dict(files)
    for i in range(n):
        r = _mutate_one(cur, None, seed + i)
        if not r:
            break
        goal, path, new_src = r
        old_src = cur[path]
        cur[path] = new_src
        yield {"goal": goal, "path": path,
               "diff": _diff(path, old_src, new_src), "files": dict(cur)}
