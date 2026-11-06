/**
 * fluxling-transform — Bun/TS modular port of the fluxling transform engine.
 *
 * - applydiff.ts  — apply unified diffs to files on disk (path-traversal safe)
 * - core.ts       — smartapply (fuzzy path resolution, deterministic apply)
 * - llm.ts        — agentic LLM layer (file + project prompts, router-routed)
 * - mutate.ts     — offline deterministic code mutation (no LLM)
 * - workflow.ts   — code-run-first patch workflows (propose → apply → verify)
 */
export * from "./applydiff.ts";
export * from "./core.ts";
export * from "./llm.ts";
export * from "./mutate.ts";
export * from "./workflow.ts";
export type { Files } from "./core.ts";