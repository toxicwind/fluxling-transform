# AGENTS.md — codeflux-patchling

> Refines: `/home/toxic/AGENTS.md` (the estate control-plane). This file is
> **living doctrine** for the codeflux family. It asserts "refines, never
> contradicts" the estate contract.

## Living code (2026-11-04, architect directive)

**This product is "living code" — agents MAY modify, mutate, and add to it as
they use it.** Patchling is a bounded code-transformation primitive, and the
codeflux family (patchling, rig, code-racer) exists to be embedded, extended,
and raced. Do not treat it as frozen.

- **Modify in place**: if a transformation, backend, or CLI surface is missing
  or wrong for the task at hand, fix it here — root cause, real committed file.
- **Add freely**: new backends (e.g. freeinference/qwen via the estate router),
  new diff strategies, new `mutate` rules, new CLI flags — all welcome.
- **Race before you settle**: when choosing between two transformation
  approaches, race them with the sibling `code-racer` harness (first-passing
  acceptance-test wins) and record the winner in the commit.
- **Keep the contract**: `generate_diff` / `smartapply` / `mutate` /
  `build_environment` are the public API. Extend additive-only; never break a
  caller that imports `from patchling import ...`.
- **No agent harness**: patchling stays a bounded primitive (files in, files
  out, no filesystem access, no agent loop). If you want an agent loop, that
  belongs in codeflux-rig / the estate, not here.

## Build / test

```bash
pip install -e .          # or: pip install patchling
pytest tests/             # 55+ tests
patchling --help          # CLI: generate + optionally apply diffs
```

## Conventions

- Python. Follow the existing module layout (`core.py`, `gptpatch.py`,
  `mutate.py`, `applydiff.py`, `workflows.py`).
- `smartapply` is the crown jewel: per-file AI-assisted patch resolution that
  survives fuzzy hunks / renames / new files. Preserve and harden it.
- New backends go behind the same `generate_diff` seam — a caller must not
  need to know which backend produced the diff.
- Commit imperative mood, scope prefix (`core:`, `mutate:`, `cli:`, `docs:`).

## Don't

- Don't add a filesystem-walking agent loop here (that's rig/estate).
- Don't silently swap the default backend without a race + docs note.
- Don't break `smartapply`'s tolerance for real-world rejected diffs.