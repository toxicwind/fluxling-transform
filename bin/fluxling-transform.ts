#!/usr/bin/env bun
/**
 * fluxling-transform CLI — the transform engine (smartapply, mutate, generate).
 *
 * Usage:
 *   fluxling-transform smartapply <diff-file> <files...>   apply a diff to files
 *   fluxling-transform mutate <file> [--seed N] [--rule R]  deterministic mutation
 *   fluxling-transform --help                               show usage
 */
import { smartapply } from "../src/core.ts";
import { mutateDiff } from "../src/mutate.ts";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === "--help" || cmd === "-h" || !cmd) {
  console.log(`fluxling-transform — the fluxling transform engine (Bun/TS)

USAGE
  fluxling-transform smartapply <diff-file> <files...>
      Apply a unified diff (in diff-file) to the given files. Prints the
      updated files as JSON.

  fluxling-transform mutate <file> [--seed N] [--rule R]
      Produce a deterministic mutation of a Python file. Prints the goal + diff.

  fluxling-transform --help
      Show this help.
`);
  process.exit(0);
}

if (cmd === "smartapply") {
  const diffFile = args[1];
  const files = args.slice(2);
  if (!diffFile || !files.length) {
    console.error("usage: fluxling-transform smartapply <diff-file> <files...>");
    process.exit(1);
  }
  const diff = readFileSync(diffFile, "utf8");
  const env: Record<string, string> = {};
  for (const f of files) env[f] = readFileSync(f, "utf8");
  const changed = smartapply(diff, env);
  console.log(JSON.stringify(changed, null, 2));
} else if (cmd === "mutate") {
  const file = args[1];
  const seedIdx = args.indexOf("--seed");
  const ruleIdx = args.indexOf("--rule");
  const seed = seedIdx >= 0 ? Number(args[seedIdx + 1]) : 0;
  const rule = ruleIdx >= 0 ? args[ruleIdx + 1] : undefined;
  if (!file) {
    console.error("usage: fluxling-transform mutate <file> [--seed N] [--rule R]");
    process.exit(1);
  }
  const content = readFileSync(file, "utf8");
  const [goal, diff] = mutateDiff({ [file]: content }, rule, seed);
  console.log(`goal: ${goal}`);
  console.log(diff ?? "no mutation applies");
} else {
  console.error(`fluxling-transform: unknown command '${cmd}'`);
  process.exit(1);
}