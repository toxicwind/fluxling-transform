/**
 * fluxling-transform applydiff — apply unified git diffs to files on disk.
 * Full Bun/TS port of fluxling/applydiff.py (modular).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

export class UnsafePathError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "UnsafePathError";
  }
}

/** Resolve a diff target path within the project dir (path-traversal guard). */
export function resolveWithin(projectDir: string, relPath: string): string {
  if (["1", "true", "yes"].includes(process.env.GPTDIFF_ALLOW_UNSAFE_PATHS ?? "")) {
    return join(projectDir, relPath);
  }
  const root = resolve(projectDir);
  const target = resolve(root, relPath);
  if (target !== root && !target.startsWith(root + "/")) {
    throw new UnsafePathError(`diff target escapes project dir: ${relPath!}`);
  }
  return target;
}

function fileHash(filepath: string): string {
  const h = createHash("sha256");
  h.update(readFileSync(filepath));
  return h.digest("hex");
}

/** Apply a single-file patch to filePath. Returns true on success. */
export function applyPatchToFile(filePath: string, patch: string): boolean {
  const originalLines = existsSync(filePath) ? readFileSync(filePath, "utf8").split(/(?<=\n)/) : [];
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
        if (!m) {
          console.error("Invalid hunk header:", line);
          return false;
        }
        origStart = m[1] ? Number(m[1]) : 1;
      }
      const hunkStartIndex = origStart - 1;
      if (hunkStartIndex > originalLines.length) {
        console.error("Hunk start index beyond file length");
        return false;
      }
      newLines.push(...originalLines.slice(currentIndex, hunkStartIndex));
      currentIndex = hunkStartIndex;
      i += 1;
      while (i < patchLines.length && !patchLines[i].trimStart().startsWith("@@")) {
        const pline = patchLines[i];
        if (pline.startsWith(" ")) {
          const expected = pline.slice(1);
          if (currentIndex >= originalLines.length) {
            console.error("Context line expected but file ended");
            return false;
          }
          const origLine = originalLines[currentIndex].replace(/\n$/, "");
          if (origLine !== expected) {
            console.error("Context line mismatch. Expected:", expected, "Got:", origLine);
            return false;
          }
          newLines.push(originalLines[currentIndex]);
          currentIndex += 1;
        } else if (pline.startsWith("-")) {
          const expected = pline.slice(1);
          if (currentIndex >= originalLines.length) {
            console.error("Removal line expected but file ended");
            return false;
          }
          const origLine = originalLines[currentIndex].replace(/\n$/, "");
          if (origLine !== expected) {
            console.error("Removal line mismatch. Expected:", expected, "Got:", origLine);
            return false;
          }
          currentIndex += 1;
        } else if (pline.startsWith("+")) {
          newLines.push(pline.slice(1) + "\n");
        } else {
          if (currentIndex >= originalLines.length) {
            console.error("We are trying a smart diff, dumb diff failed");
            return false;
          }
          const origLine = originalLines[currentIndex].replace(/\n$/, "");
          if (origLine !== pline) {
            console.error("We are trying a smart diff, dumb diff failed");
            return false;
          }
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
  mkdirSync(dirname(filePath), { recursive: true });
  let content = newLines.join("");
  if (content && !content.endsWith("\n")) content += "\n";
  writeFileSync(filePath, content, "utf8");
  return true;
}

/** Parse unified diff text into per-file patches. */
export function parseDiffPerFile(diffText: string): Array<[string, string]> {
  const dedup = (diffs: Array<[string, string]>): Array<[string, string]> => {
    const groups = new Map<string, string[]>();
    for (const [key, value] of diffs) {
      groups.set(key, [...(groups.get(key) ?? []), value]);
    }
    return [...groups.entries()].map(([k, v]) => [k, v.join("\n")]);
  };

  if (diffText.includes("*** Begin Patch")) {
    const lines = diffText.split("\n");
    const diffs: Array<[string, string]> = [];
    let currentLines: string[] = [];
    let currentFile: string | null = null;
    let inPatch = false;
    for (const line of lines) {
      const stripped = line.trim();
      if (stripped === "*** Begin Patch") {
        inPatch = true;
        currentLines = [];
        currentFile = null;
      } else if (stripped === "*** End Patch") {
        if (currentFile !== null) diffs.push([currentFile, currentLines.join("\n")]);
        inPatch = false;
      } else if (inPatch) {
        if (stripped.startsWith("*** Update File:")) {
          currentFile = stripped.split(":", 1)[1].trim();
        } else {
          currentLines.push(line);
        }
      }
    }
    return dedup(diffs);
  }

  const headerRe = /^(?:diff --git\s+)?(a\/[^ ]+)\s+(b\/[^ ]+)\s*$/;
  const lines = diffText.split("\n");
  const hasHeader = lines.some((l) => headerRe.test(l));

  if (!hasHeader) {
    const diffs: Array<[string, string]> = [];
    let currentLines: string[] = [];
    let currentFile: string | null = null;
    let deletionMode = false;
    let fromHeader: string | null = null;
    const headerFromRe = /^-{2,3}\s+(.*)$/;
    const headerToRe = /^\+{2,3}\s+(.*)$/;
    for (const line of lines) {
      const fromMatch = headerFromRe.exec(line);
      const toMatch = headerToRe.exec(line);
      if (fromMatch) {
        if (currentFile !== null && currentLines.length) {
          if (deletionMode && !currentLines.some((l) => l.startsWith("+++ /dev/null"))) currentLines.push("+++ /dev/null");
          diffs.push([currentFile, currentLines.join("\n")]);
        }
        currentLines = [line];
        deletionMode = false;
        currentFile = null;
        fromHeader = fromMatch[1].trim();
        continue;
      }
      if (toMatch && currentLines.length) {
        currentLines.push(line);
        const fileTo = toMatch[1].trim();
        if (fileTo === "/dev/null") {
          deletionMode = true;
          if (fromHeader && fromHeader !== "/dev/null") {
            currentFile = fromHeader.startsWith("a/") || fromHeader.startsWith("b/") ? fromHeader.slice(2) : fromHeader;
          }
        } else {
          currentFile = fileTo.startsWith("a/") || fileTo.startsWith("b/") ? fileTo.slice(2) : fileTo;
        }
        continue;
      }
      currentLines.push(line);
      if (line.includes("deleted file mode")) deletionMode = true;
    }
    if (currentFile !== null && currentLines.length) {
      if (deletionMode && !currentLines.some((l) => l.startsWith("+++ "))) currentLines.push("+++ /dev/null");
      diffs.push([currentFile, currentLines.join("\n")]);
    }
    return dedup(diffs);
  }

  const diffs: Array<[string, string]> = [];
  let currentLines: string[] = [];
  let currentFile: string | null = null;
  let deletionMode = false;
  for (const line of lines) {
    const m = headerRe.exec(line);
    if (m) {
      if (currentFile !== null && currentLines.length) {
        if (deletionMode && !currentLines.some((l) => l.startsWith("+++ "))) currentLines.push("+++ /dev/null");
        diffs.push([currentFile, currentLines.join("\n")]);
      }
      currentLines = [line];
      deletionMode = false;
      const fileTo = m[2];
      currentFile = fileTo.startsWith("b/") ? fileTo.slice(2) : fileTo;
    } else {
      currentLines.push(line);
      if (line.includes("deleted file mode")) deletionMode = true;
      if (line.startsWith("+++ ")) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const fileTo = parts[1].trim();
          if (fileTo !== "/dev/null") currentFile = fileTo.startsWith("a/") || fileTo.startsWith("b/") ? fileTo.slice(2) : fileTo;
        }
      }
    }
  }
  if (currentFile !== null && currentLines.length) {
    if (deletionMode && !currentLines.some((l) => l.startsWith("+++ "))) currentLines.push("+++ /dev/null");
    diffs.push([currentFile, currentLines.join("\n")]);
  }
  return dedup(diffs);
}

/** Apply a unified diff to files in projectDir. Returns true if any file changed. */
export function applyDiff(projectDir: string, diffText: string, allowUnsafePaths?: boolean): boolean {
  const filePatches = parseDiffPerFile(diffText);
  if (!filePatches.length) {
    console.error("No file patches found in diff.");
    return false;
  }
  const originalHashes = new Map<string, string | null>();
  for (const [filePath] of filePatches) {
    const target = join(projectDir, filePath);
    originalHashes.set(filePath, existsSync(target) ? fileHash(target) : null);
  }
  let anyChange = false;
  for (const [filePath, patch] of filePatches) {
    const allow = allowUnsafePaths ?? ["1", "true", "yes"].includes(process.env.GPTDIFF_ALLOW_UNSAFE_PATHS ?? "");
    let targetFile: string;
    if (allow) {
      targetFile = join(projectDir, filePath);
    } else {
      try {
        targetFile = resolveWithin(projectDir, filePath);
      } catch (e) {
        console.error(`Refusing unsafe diff path: ${(e as Error).message}`);
        return false;
      }
    }
    if (patch.includes("+++ /dev/null")) {
      if (existsSync(targetFile)) {
        unlinkSync(targetFile);
        if (!existsSync(targetFile)) anyChange = true;
        else {
          console.error(`Failed to delete file: ${targetFile}`);
          return false;
        }
      }
    } else {
      const success = applyPatchToFile(targetFile, patch);
      if (!success) {
        console.error(`Failed to apply patch to file: ${targetFile}`);
        return false;
      }
    }
  }
  for (const [filePath] of filePatches) {
    const targetFile = join(projectDir, filePath);
    const oldHash = originalHashes.get(filePath);
    if (existsSync(targetFile)) {
      const newHash = fileHash(targetFile);
      if (oldHash !== newHash) anyChange = true;
      else console.error(`No change detected in file: ${targetFile}`);
    } else {
      console.error(`Expected modification or creation but file is missing: ${targetFile}`);
      return false;
    }
  }
  if (!anyChange) {
    console.error("Patch applied but no file modifications detected.");
    return false;
  }
  return true;
}