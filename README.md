# fluxling-transform

**Bun/TS modular port of the fluxling transform engine — smartapply, path-safe
diff application, agentic LLM prompts, deterministic mutation, and
code-run-first workflows.**

> Part of the **flux** pen (build/CI). The transform member of the fluxling
> family. Ex `codeflux-patchling` (Python), fully ported to Bun/TS with tsgo
> (TypeScript 7) typechecking.

## Modules

| Module | Role |
|---|---|
| `src/applydiff.ts` | apply unified diffs to files on disk (path-traversal safe) |
| `src/core.ts` | `smartapply` — fuzzy path resolution + deterministic apply |
| `src/llm.ts` | agentic LLM layer — **file + project prompts**, router-routed |
| `src/mutate.ts` | offline deterministic code mutation (no LLM) |
| `src/workflow.ts` | code-run-first patch workflows (propose → apply → verify) |

## Quickstart

```bash
bun install
bun test                 # 15/15 pass
bun run typecheck        # tsgo (TS7), exit 0
```

## Agentic prompts (file + project)

The LLM layer ships properly-engineered prompts for **both** transformation
scales:

- **Project-level** (`projectSystemPrompt` / `projectUserPrompt`) — generate a
  full unified diff for a goal across a project. Enforces minimal change,
  exact context lines, and a strict `\`\`\`diff` output contract.
- **File-level** (`fileSystemPrompt` / `fileUserPrompt`) — apply a diff to one
  file with conflict resolution. Preserves surrounding context, outputs the
  complete file.

Both route through the estate router (rhodochrosite :25193) with kryptos SSOT.

## smartapply

The crown jewel: fuzzy path resolution for LLM-emitted diffs (strip `a/ b/`
prefixes, suffix match, basename match, content fingerprint), then
deterministic hunk application. Handles creations, modifications, deletions.

```ts
import { smartapply } from "@estate/fluxling-transform";

const updated = smartapply(diffText, { "src/app.ts": "original" });
// updated["src/app.ts"] = applied content; deleted files omitted
```

## Deeplinks

- [fluxling](../fluxling/) — the umbrella (NL goal → diff)
- [fluxling-rig](../fluxling-rig/) — the agent-loop rig harness
- [flux pen](../../) — the build/CI pen (thin coordinator)

## License

MIT. Built for the estate's flux pen.