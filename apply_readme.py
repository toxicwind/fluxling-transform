#!/usr/bin/env python3
"""Append the offline-mutation docs section to patchling's README (idempotent)."""
PATH = "/home/toxic/sovereign/codeflux/forks/patchling/README.md"
MARKER = "## Offline mutation backend (no LLM required)"
SECTION = """
## Offline mutation backend (no LLM required)

`patchling.mutate` generates unified diffs from deterministic, rule-based
source transforms — no API key, no network. Built for synthetic streams,
demos and tests (it powers codeflux's demo mode), and gives patchling a
fully offline mode. Deterministic given `(rule, seed)`.

```python
from patchling.mutate import mutate_diff, mutate_stream

goal, diff = mutate_diff({"app.py": "def hello():\\n    pass\\n"}, seed=3)
print(goal)  # e.g. "Add docstring to first function"

for step in mutate_stream(files, n=5, seed=3):
    print(step["goal"], "->", step["path"])
```

Available rules: `rename_function`, `add_docstring`, `insert_logging`,
`bump_constant`, `add_function`. Combine with `smartapply` (which needs no
key either) for a complete offline transform loop.
"""


def main():
    src = open(PATH).read()
    if MARKER in src:
        print("README already documents mutate; nothing to do")
        return
    if not src.endswith("\n"):
        src += "\n"
    open(PATH, "w").write(src + SECTION)
    print("README section appended")


if __name__ == "__main__":
    main()
