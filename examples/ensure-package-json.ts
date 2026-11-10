#!/usr/bin/env bun
// one-off: ensure every pens product has a package.json.
// Scans pens/*/products/*, lists products missing package.json, then hands the
// list to fluxling-transform (chat) to generate each manifest autonomously,
// validating JSON before write. Deterministic fallback if the LLM lane is down.
import { chat } from "@estate/fluxling-transform";
import { readdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const PENS = "/home/toxic/pens";
const products: { dir: string; name: string; entries: string[]; readme: string }[] = [];

for (const pen of readdirSync(PENS)) {
  const pdir = join(PENS, pen, "products");
  if (!existsSync(pdir)) continue;
  for (const prod of readdirSync(pdir)) {
    const dir = join(pdir, prod);
    if (!existsSync(join(dir, ".git"))) continue; // products are standalone git repos
    if (existsSync(join(dir, "package.json"))) continue;
    const entries = readdirSync(dir).filter((e) => !e.startsWith("."));
    if (!entries.some((e) => ["src", "bin", "helper", "README.md", "docs"].includes(e))) continue;
    let readme = "";
    try {
      readme = readFileSync(join(dir, "README.md"), "utf-8").slice(0, 1500);
    } catch {}
    products.push({ dir, name: prod, entries, readme });
  }
}

console.log(`products missing package.json: ${products.length}`);
for (const p of products) console.log(`  ${p.dir}`);

function fallback(p: (typeof products)[0]): string {
  const binEntries = existsSync(join(p.dir, "bin"))
    ? readdirSync(join(p.dir, "bin")).filter((f) => f.endsWith(".ts"))
    : [];
  const bin = Object.fromEntries(binEntries.map((f) => [basename(f, ".ts"), `./bin/${f}`]));
  const nonTs = ["Cargo.toml", "go.mod", "pyproject.toml", "setup.py"].some((f) =>
    p.entries.includes(f),
  );
  const scripts = nonTs
    ? {
        build: p.entries.includes("Cargo.toml") ? "cargo build" : p.entries.includes("go.mod") ? "go build ./..." : "python -m build",
        test: p.entries.includes("Cargo.toml") ? "cargo test" : p.entries.includes("go.mod") ? "go test ./..." : "pytest",
      }
    : {
        dev: "bun --hot run src/index.ts",
        test: "bun test",
        typecheck: "tsgo --noEmit -p tsconfig.json",
        lint: "bun x biome check .",
        fmt: "bun x biome format --write .",
        build: "bun build src/index.ts --outdir dist",
      };
  return JSON.stringify(
    {
      name: `@estate/${p.name}`,
      version: "0.1.0",
      private: true,
      type: "module",
      ...(Object.keys(bin).length ? { bin } : {}),
      scripts,
      devDependencies: nonTs
        ? {}
        : { "@types/bun": "^1.4.4", "bun-types": "^1.4.4", typescript: "^5.0.0", "@biomejs/biome": "^1.9.0" },
    },
    null,
    2,
  ) + "\n";
}

for (const p of products) {
  let content: string;
  try {
    const raw = await chat([
      {
        role: "user",
        content:
          `Generate a COMPLETE package.json for this estate product (Bun/TypeScript unless Cargo.toml/go.mod/pyproject.toml present — then wrap the native toolchain). ` +
          `For Bun products include the full script set: dev ("bun --hot run <entry>"), test ("bun test"), typecheck ("tsgo --noEmit -p tsconfig.json"), lint + fmt (biome), build (bun build), plus a "bin" map when bin/*.ts entrypoints exist, and devDependencies (@types/bun, bun-types, typescript, @biomejs/biome). ` +
          `Respond with ONLY the JSON, no fences.\n` +
          `dir entries: ${p.entries.join(", ")}\nREADME:\n${p.readme}`,
      },
    ]);
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in response");
    const parsed = JSON.parse(m[0]); // validate before write
    if (!parsed.name || !parsed.version) throw new Error("missing name/version");
    parsed.private = true;
    parsed.type = parsed.type ?? "module";
    content = JSON.stringify(parsed, null, 2) + "\n";
    console.log(`[fluxling] ${p.name}: ${parsed.name}@${parsed.version}`);
  } catch (e) {
    console.log(`[fallback] ${p.name}: ${e}`);
    content = fallback(p);
  }
  writeFileSync(join(p.dir, "package.json"), content);
  console.log(`  wrote ${join(p.dir, "package.json")}`);
}
console.log("done");
