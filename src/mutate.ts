/**
 * fluxling-transform mutate — offline deterministic code mutation (no LLM).
 * Port of fluxling/mutate.py to Bun/TS, modularized.
 *
 * Rule-based source transforms that produce unified diffs. Deterministic given
 * (rule, seed): the same seed always yields the same mutation.
 */

export type Files = Record<string, string>;
type Rng = { nextInt: (max: number) => number; shuffle: <T>(arr: T[]) => T[] };

/** Deterministic PRNG (mulberry32) — seedable, reproducible. */
function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    nextInt: (max: number) => Math.floor(next() * max),
    shuffle: (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

function unifiedDiff(path: string, oldSrc: string, newSrc: string): string {
  const oldLines = oldSrc.split("\n");
  const newLines = newSrc.split("\n");
  const out: string[] = [`--- a/${path}`, `+++ b/${path}`];
  // Simple LCS-free diff: emit a single hunk covering the whole file (deterministic).
  out.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
  for (const l of oldLines) out.push(`-${l}`);
  for (const l of newLines) out.push(`+${l}`);
  return out.join("\n");
}

type Rule = (src: string, rng: Rng) => [string, string] | null;

function renameFunction(src: string, rng: Rng): [string, string] | null {
  const m = /^def (\w+)\(/m.exec(src);
  if (!m) return null;
  const old = m[1];
  const next = `${old}_v${rng.nextInt(8) + 2}`;
  // Replace only the FIRST occurrence (JS replace with a string does this).
  return [src.replace(`def ${old}(`, `def ${next}(`), `Rename ${old} to ${next}`];
}

function addDocstring(src: string, _rng: Rng): [string, string] | null {
  const m = /^(def \w+\(.*\):\n)/m.exec(src);
  if (!m) return null;
  const headEnd = m[0].length;
  if (src.slice(headEnd, headEnd + 120).includes('"""')) return null;
  const doc = '    """Synthetic docstring added by fluxling mutation."""\n';
  return [src.slice(0, headEnd) + doc + src.slice(headEnd), "Add docstring to first function"];
}

function insertLogging(src: string, _rng: Rng): [string, string] | null {
  const m = /^(def \w+\(.*\):\n)/m.exec(src);
  if (!m) return null;
  const probe = '    print("[fluxling] mutation probe")\n';
  return [src.slice(0, m[0].length) + probe + src.slice(m[0].length), "Insert logging probe in first function"];
}

function bumpConstant(src: string, _rng: Rng): [string, string] | null {
  const m = /^([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*$/m.exec(src);
  if (!m) return null;
  const name = m[1];
  const val = Number(m[2]);
  return [src.slice(0, m.index + m[0].indexOf(m[2])) + String(val + 1) + src.slice(m.index + m[0].indexOf(m[2]) + m[2].length), `Bump ${name} from ${val} to ${val + 1}`];
}

function addFunction(src: string, rng: Rng): [string, string] | null {
  const name = `mutated_helper_${rng.nextInt(900) + 100}`;
  const add = `\n\ndef ${name}():\n    """Synthetic helper added by fluxling mutation."""\n    return ${rng.nextInt(99) + 1}\n`;
  return [src.replace(/\n+$/, "") + "\n" + add, `Add helper function ${name}`];
}

const RULES: Array<[string, Rule]> = [
  ["rename_function", renameFunction],
  ["add_docstring", addDocstring],
  ["insert_logging", insertLogging],
  ["bump_constant", bumpConstant],
  ["add_function", addFunction],
];

function mutateOne(files: Files, rule: string | null, seed: number): [string, string, string] | null {
  const rng = makeRng(seed);
  const py = Object.keys(files).filter((p) => p.endsWith(".py")).sort() ?? Object.keys(files).sort();
  if (!py.length) return null;
  const path = py[rng.nextInt(py.length)];
  const src = files[path];
  let fns = rule ? RULES.filter(([name]) => name === rule) : RULES;
  if (!rule) fns = rng.shuffle(fns);
  for (const [, fn] of fns) {
    try {
      const res = fn(src, rng);
      if (res) {
        const [newSrc, goal] = res;
        if (newSrc !== src) return [goal, path, newSrc];
      }
    } catch {
      // Rule did not apply — try the next.
    }
  }
  return null;
}

/** Return [goal, unifiedDiff] for one deterministic mutation, or [null, null]. */
export function mutateDiff(files: Files, rule?: string, seed = 0): [string | null, string | null] {
  const r = mutateOne(files, rule ?? null, seed);
  if (!r) return [null, null];
  const [goal, path, newSrc] = r;
  return [goal, unifiedDiff(path, files[path], newSrc)];
}

/** Yield chained mutation steps; each applies to the previous result. */
export function* mutateStream(files: Files, n = 5, seed = 0): Generator<{ goal: string; path: string; diff: string; files: Files }> {
  const cur: Files = { ...files };
  for (let i = 0; i < n; i++) {
    const r = mutateOne(cur, null, seed + i);
    if (!r) break;
    const [goal, path, newSrc] = r;
    const oldSrc = cur[path];
    cur[path] = newSrc;
    yield { goal, path, diff: unifiedDiff(path, oldSrc, newSrc), files: { ...cur } };
  }
}