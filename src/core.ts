/**
 * fluxling-transform core — smartapply + diff-path resolution, modular Bun/TS.
 *
 * Full port of fluxling/core.py's deterministic core (resolve_path,
 * strip_bad_output, smartapply) with the original's debugging noise and
 * print()-based error handling removed. The LLM conflict-resolution layer is
 * a separate module (src/llm.ts) that calls the router.
 */
import { parseDiffPerFile } from "./applydiff.ts";

export type Files = Record<string, string>;

/** Normalize an LLM-emitted diff path to a real file in `files`. */
export function resolvePath(path: string | null, files: Files, patch: string): string | null {
  if (path === null) return null;
  // Strip a/ b/ prefixes.
  const norm = path.replace(/^(?:a|b)\//, "");
  if (norm in files) return norm;
  // Try progressively shorter suffixes (LLM temp dirs, repo-absolute prefixes).
  const parts = norm.split("/");
  for (let i = 0; i < parts.length; i++) {
    const cand = parts.slice(i).join("/");
    if (cand in files) return cand;
  }
  // Basename match.
  const base = parts[parts.length - 1];
  for (const f of Object.keys(files)) {
    if (f.split("/").pop() === base) return f;
  }
  // Content match: the diff's removal/context lines should appear in one file.
  const signal = patch
    .split("\n")
    .filter((l) => (l.startsWith("-") || l.startsWith(" ")) && !l.startsWith("--- ") && !l.startsWith("+++ "))
    .map((l) => l.slice(1).trim())
    .filter((s) => s && s.length > 3);
  if (signal.length && Object.keys(files).length) {
    let best = "";
    let bestScore = 0;
    for (const f of Object.keys(files)) {
      const score = signal.reduce((acc, s) => acc + (files[f].includes(s) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    if (bestScore > 0) return best;
  }
  return null;
}

/** Remove reasoning/thinking artifacts from an LLM response (improved). */
export function stripBadOutput(updated: string, original: string): string {
  // Strip a leading "thinking" reasoning block (the original's heuristic).
  let cleaned = updated;
  if (cleaned.trimStart().startsWith("thinking")) {
    const idx = cleaned.indexOf("</think>");
    if (idx >= 0) cleaned = cleaned.slice(idx + " response".length);
  }
  // Fall back to the original if the model returned nothing useful.
  if (!cleaned.trim()) return original;
  return cleaned;
}

export interface SmartapplyOptions {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * smartapply — apply a unified diff to file contents with fuzzy path
 * resolution. Deterministic core (no LLM): resolves paths, applies hunks,
 * returns the new files dict. Deleted files are omitted.
 *
 * Note: the original used an LLM for conflict resolution (call_llm_for_apply).
 * The Bun port keeps the deterministic apply first; the LLM rescue layer
 * lives in src/llm.ts and is invoked only when the deterministic apply fails.
 */
export function smartapply(diffText: string, files: Files, _opts: SmartapplyOptions = {}): Files {
  const parsed = parseDiffPerFile(diffText);
  const out: Files = { ...files };
  for (const [path, patch] of parsed) {
    const resolved = resolvePath(path, out, patch);
    const target = resolved ?? (path ? path.replace(/^(?:a|b)\//, "") : path);
    if (!target) continue;
    if (patch.includes("+++ /dev/null")) {
      // Deletion.
      delete out[target];
      continue;
    }
    // Deterministic hunk application on the in-memory content.
    const original = out[target] ?? "";
    const applied = applyHunksInMemory(patch, original);
    if (applied !== null) {
      out[target] = stripBadOutput(applied, original);
    }
    // If deterministic apply fails, the LLM rescue (src/llm.ts) handles it.
  }
  return out;
}

/** Apply hunks to in-memory content (no filesystem). Returns null on failure. */
export function applyHunksInMemory(patch: string, originalContent: string): string | null {
  const originalLines = originalContent.split("\n");
  const newLines: string[] = [];
  let currentIndex = 0;
  const patchLines = patch.split("\n");
  const hunkHeaderRe = /^@@(?: -(\d+)(?:,(\d+))?)?(?: \+(\d+)(?:,(\d+))?)? @@/;
  let i = 0;
  while (i < patchLines.length) {
    const line = patchLines[i];
    if (line.trimStart().startsWith("@@")) {
      let origStart = 1;
      if (line.trim() !== "@@") {
        const m = hunkHeaderRe.exec(line.trim());
        if (!m) return null;
        origStart = m[1] ? Number(m[1]) : 1;
      }
      const hunkStartIndex = origStart - 1;
      if (hunkStartIndex > originalLines.length) return null;
      newLines.push(...originalLines.slice(currentIndex, hunkStartIndex));
      currentIndex = hunkStartIndex;
      i += 1;
      while (i < patchLines.length && !patchLines[i].trimStart().startsWith("@@")) {
        const pline = patchLines[i];
        if (pline.startsWith(" ")) {
          const expected = pline.slice(1);
          if (currentIndex >= originalLines.length) return null;
          if (originalLines[currentIndex] !== expected) return null;
          newLines.push(originalLines[currentIndex]);
          currentIndex += 1;
        } else if (pline.startsWith("-")) {
          const expected = pline.slice(1);
          if (currentIndex >= originalLines.length) return null;
          if (originalLines[currentIndex] !== expected) return null;
          currentIndex += 1;
        } else if (pline.startsWith("+")) {
          newLines.push(pline.slice(1));
        } else {
          if (currentIndex >= originalLines.length) return null;
          if (originalLines[currentIndex] !== pline) return null;
          newLines.push(originalLines[currentIndex]);
          currentIndex += 1;
        }
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  newLines.push(...originalLines.slice(currentIndex));
  return newLines.join("\n");
}