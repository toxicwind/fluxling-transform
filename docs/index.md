# Patchling

<div align="right">

[![repo](https://img.shields.io/badge/github-toxicwind%2Fcodeflux--patchling-181717.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/toxicwind/codeflux-patchling)
[![pypi](https://img.shields.io/badge/pypi-patchling-3775A9.svg?style=for-the-badge&logo=pypi&logoColor=white)](https://pypi.org/project/patchling/)
[![version](https://img.shields.io/badge/version-0.8.1-2081C7.svg?style=for-the-badge)](https://pypi.org/project/patchling/)

</div>

**Natural-language code transformation as a library.** Hand Patchling a project, a
plain-English goal, and a dict of files — get back a unified diff. Apply it with
`smartapply` and get the transformed files.

```python
import patchling

diff = patchling.generate_diff(
    files,                       # {"src/app.py": "...", ...}
    "rename `fetch_data` to `load_data` and add a cache",
)
result = patchling.smartapply(project_dir, diff)   # -> transformed files
```

## What's in the box

| Surface | What it does |
|---|---|
| `patchling.generate_diff(files, goal)` | LLM-backed natural-language → unified diff |
| `patchling.smartapply(project_dir, diff)` | Applies a diff, returns transformed files |
| `patchling-apply` (CLI) | Applies unified diffs to a project directory |
| `patchling` (CLI) | Interactive LLM-backed patching session |
| `patchling.mutate_diff / mutate_stream` | **Offline, zero-dependency** dataset mutation — rename functions, add docstrings/logging, bump constants, synthesize variants with a seed |
| `patchling.color_code_diff(diff)` | Terminal-colorized diff rendering |
| `agents/fix-test-agent.py` | Example agent loop built on the toolbox |

## Why it's different

Patchling is a **bounded primitive**, not a framework: no IDE plugin, no daemon,
no magic. Two pure functions plus a diff applier you can embed in your own agent
loop. The `mutate` module works with **zero third-party dependencies** — install
offline, use it to synthesize labeled training variants from any Python corpus.

## Install

```bash
pip install patchling
```

CLI entry points: `patchling`, `patchling-apply` (plus `gptdiff` kept as a
back-compat alias).

## Links

- [Quickstart](quickstart.md) — first diff in five lines
- [API Reference](api.md) — full function reference
- [CLI Reference](cli.md)
- [Agent Loops](examples/automation.md) — embedding Patchling in automation
- [GitHub](https://github.com/toxicwind/codeflux-patchling) · [PyPI](https://pypi.org/project/patchling/)
