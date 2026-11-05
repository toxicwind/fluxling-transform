<div align="right">

[![repo](https://img.shields.io/badge/github-toxicwind%2Ffluxling-181717.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/toxicwind/fluxling)
[![pypi](https://img.shields.io/badge/pypi-fluxling-3775A9.svg?style=for-the-badge&logo=pypi&logoColor=white)](https://pypi.org/project/fluxling/)
[![version](https://img.shields.io/badge/version-0.9.0-blue.svg?style=for-the-badge)](https://github.com/toxicwind/fluxling)
[![license](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](https://github.com/toxicwind/fluxling/blob/main/LICENSE.txt)
[![codeflux](https://img.shields.io/badge/codeflux-family%20member-00ADD8.svg?style=for-the-badge)](https://github.com/toxicwind/codeflux)

</div>

# Fluxling

### Natural-language code transformation, as a library.

> _Lineage: **gptdiff** → **patchling** → **fluxling**. Same library, same API. Repo formerly `codeflux-patchling` (renamed 2026-10-31). Legacy names — `patchling`, `patchling-apply`, `gptdiff`, `gptpatch` commands, the `patchling` PyPI package, `GPTDIFF_*` env vars — all keep working during the transition._

Hand Fluxling a dict of files and a plain-English goal; get back a unified diff — and, via `smartapply`, the transformed files. **It's a bounded primitive you embed inside your own software systems, not an open-ended coding agent.** Files in, files out. No filesystem access required, no agent harness.

Adds **`fluxling.mutate`**: an offline, deterministic, rule-based mutation backend — no API key, no network. It powers [codeflux](https://github.com/toxicwind/codeflux)'s demo mode and gives Fluxling a fully offline transform loop.

```python
from fluxling import generate_diff, smartapply, build_environment

files = {"main.py": "def old_name():\n    print('Need renaming')\n"}

diff = generate_diff(build_environment(files), "Rename old_name to new_name")
updated = smartapply(diff, files)

print(updated["main.py"])
```

The hard part — applying an LLM-generated diff that `git apply` would reject — is what `smartapply` solves: per-file, AI-assisted patch resolution that survives fuzzy hunks, renames, new files, and deletions.

🌐 Project home: [patchling.app](https://patchling.app) — try it live in your browser · 📚 Full docs: [toxicwind.github.io/fluxling](https://toxicwind.github.io/fluxling/)

---

## ✨ Features

- **`generate_diff`** — plain-English goal → unified diff over an in-memory file map
- **`smartapply`** — AI-assisted patch application that survives what `git apply` rejects (fuzzy hunks, renames, new files, deletions)
- **`fluxling.mutate`** *(fork addition)* — deterministic rule-based transforms with zero API cost: `rename_function`, `add_docstring`, `insert_logging`, `bump_constant`, `add_function`. Reproducible given `(rule, seed)`
- **Bounded primitive** — one goal → one diff. Composes into agent loops without an agent harness
- **Git-native CLI** — changes arrive as diffs: review with `git diff`, keep with `git add -p`, discard with `git checkout .`
- **Any OpenAI-compatible endpoint** — bring your own key or your own provider

---

## 🧬 Offline mode: `fluxling.mutate`

```python
from fluxling.mutate import mutate_diff, mutate_stream

goal, diff = mutate_diff({"app.py": "def hello():\n    pass\n"}, seed=3)
print(goal)  # e.g. "Add docstring to first function"

for step in mutate_stream(files, n=5, seed=3):
    print(step["goal"], "->", step["path"])
```

Combine with `smartapply` (which needs no key either) for a complete offline transform loop — this is what [codeflux](https://github.com/toxicwind/codeflux) runs in demo mode to generate synthetic patch streams.

---

## 🚀 Quick start

```bash
# 1. install
pip install fluxling

# 2. set your API key (any OpenAI-compatible endpoint)
export GPTDIFF_LLM_API_KEY=<your-key>   # or point GPTDIFF_LLM_BASE_URL at your own provider

# 3. transform files in your code
fluxling "Add type hints to all functions" --apply
```

Or in Python:

```python
from fluxling import generate_diff, smartapply, build_environment

files = {
    "models.py": "class User:\n    name = CharField()",
    "tests/test_models.py": "def test_user():\n    User(name='Test').save()",
}

diff = generate_diff(
    build_environment(files),
    "Rename the 'name' field to 'username' across all layers",
)
files = smartapply(diff, files)
```

The diff is plain unified-diff text — log it, review it, gate it behind approval, or apply it immediately. That's the point: **your system stays in control of what changes and when.**

See [examples/usage_example.py](examples/usage_example.py) for a runnable version.

---

## 🔧 Architecture

```mermaid
flowchart LR
    F["📁 files dict<br/>in-memory codebase"] --> E["🧱 build_environment<br/>serialize to env string"]
    E --> G["🤖 generate_diff<br/>LLM or mutate backend"]
    G --> D["📄 unified diff<br/>plain text, reviewable"]
    D --> S["🧠 smartapply<br/>AI-assisted apply"]
    S --> F2["📁 updated files dict<br/>input never mutated"]
```

### Core API

| Function | What it does |
|---|---|
| `generate_diff(environment, goal, model=...)` | unified diff implementing the goal; `model` defaults to `GPTDIFF_MODEL` |
| `smartapply(diff_text, files, model=...)` | applies a diff with AI conflict resolution; returns a new dict, input untouched |
| `build_environment(files)` | serializes a files dict into the environment string `generate_diff` expects |
| `load_project_files(path, cwd)` / `save_files(files, base_dir)` | optional filesystem helpers (respect `.gitignore` / `.gptignore`) |

Full signatures and edge cases: [API Reference](https://toxicwind.github.io/fluxling/api).

### Choosing a model

Reasoning models produce more accurate diffs for complex changes; fast models win for applying diffs and simple edits.

| Model | Best for | Notes |
|---|---|---|
| `gemini-3-pro-preview` | Generating diffs | **Recommended default** |
| `gpt-4o` / `claude-sonnet-4-20250514` | Complex or context-sensitive changes | Slower, more careful |
| `gpt5-mini` | Applying diffs (`smartapply`) | Fast and reliable — best `GPTDIFF_SMARTAPPLY_MODEL` |
| `gemini-2.0-flash` | Simple text changes | Most cost-effective |

```bash
export GPTDIFF_MODEL='gemini-3-pro-preview'
export GPTDIFF_SMARTAPPLY_MODEL='gpt5-mini'
```

---

## ⚙️ Config

| Variable | Purpose | Default |
|---|---|---|
| `GPTDIFF_LLM_API_KEY` | API key (required) | — |
| `GPTDIFF_MODEL` | Model for diff generation | `deepseek-reasoner` |
| `GPTDIFF_SMARTAPPLY_MODEL` | Model for applying diffs | `deepseek-reasoner` |
| `GPTDIFF_LLM_BASE_URL` | OpenAI-compatible endpoint | `https://nano-gpt.com/api/v1/` |

Get a key at [nano-gpt.com/api](https://nano-gpt.com/api), or self-host. Optional services: none required — `fluxling.mutate` + `smartapply` run fully offline.

**Estate default (codeflux family)**: `fluxling/freeinference.py` routes through the estate's rhodochrosite router (`PATCHLING_ROUTER_URL`, default `http://127.0.0.1:25193/v1`) to the freeinference qwen lane — model `qwen3.6-35b`, bare ids only (prefixed ids 404 on the router). This is what the estate's agents use by default; nano-gpt is the standalone fallback.

### Command-line tools

> Former names — **`patchling`**, **`patchling-apply`**, **`gptdiff`**, **`gptpatch`** — all still work as aliases for `fluxling`, `fluxling-apply`, and `fluxling-workflow`.

| Command | What it does |
|---|---|
| `fluxling "prompt"` | writes `prompt.txt` only — preview what would be sent |
| `fluxling "prompt" --call` | generates the diff into `diff.patch` for review |
| `fluxling "prompt" --apply` | generates and applies in one step |
| `fluxling-apply path/to/diff.patch` | applies a diff — standard logic first, `smartapply` fallback |

```bash
cd your-project
fluxling "Add type hints to all functions" --apply
fluxling "Add logging" src/api/ src/utils/helpers.py   # target specific paths
```

Flags: `--model`, `--temperature`, `--prepend <file>`, `--image <path>`, `--nobeep`. Full list: [CLI Reference](https://toxicwind.github.io/fluxling/cli).

### Agent loops

Each invocation is bounded (one goal → one diff), so the CLI composes into loops:

```bash
while true; do
  fluxling "Add missing test cases for edge conditions" --apply
  git add -A && git commit -m "Auto-improvement $(date +%H:%M)" 2>/dev/null
  sleep 30
done
```

One overnight test-coverage loop took a project from 18 to 127 test cases. Recipes and guardrails: [Automation Guide](https://toxicwind.github.io/fluxling/examples/automation).

---

## 🛠️ Dev

```bash
pip install -e .[test]
pytest tests/
```

Docs live at [toxicwind.github.io/fluxling](https://toxicwind.github.io/fluxling/); preview locally with `pip install .[docs] && mkdocs serve`. Contributions welcome — this fork's `mutate` backend is the codeflux-facing surface, so keep it deterministic and key-free.

---

## 🧬 The codeflux family

| Repo | Role |
|---|---|
| [**codeflux**](https://github.com/toxicwind/codeflux) | the live streaming pipeline |
| [**codeflux-moulti**](https://github.com/toxicwind/codeflux-moulti) | TUI steps + `stream` subcommand |
| [**codeflux-fluxling**](https://github.com/toxicwind/codeflux-fluxling) | deterministic mutation backend (this repo) |
| [**codeflux-python-patch**](https://github.com/toxicwind/codeflux-python-patch) | hunks-as-data + apply reports |
| [**codeflux-watchfiles**](https://github.com/toxicwind/codeflux-watchfiles) | structured file events |

Related: [patchling.app](https://patchling.app) · [patchling for JS](https://github.com/255BITS/patchling) ([npm](https://www.npmjs.com/package/patchling)) · [nanoodle.com](https://nanoodle.com) · [live demos](https://255bits.github.io/patchling-examples/) · [AI Agent Toolbox](https://github.com/255BITS/ai-agent-toolbox)

---

## 📄 License & security

**License:** public domain — this is free and unencumbered software released into the public domain. See [LICENSE.txt](LICENSE.txt). Built by [255labs](https://255labs.xyz).

**Security:** never commit `GPTDIFF_LLM_API_KEY` — use env vars or a secrets manager. Report vulnerabilities privately via GitHub Security Advisories on this repo.

---

> originally [255BITS/patchling-py](https://github.com/255BITS/patchling-py) by 255labs (MIT). this fork exists because codeflux needs an offline, deterministic mutation backend (`fluxling.mutate`) without any network dependency.
