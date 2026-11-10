import { describe, it, expect } from "bun:test";
import { parseTsDiagnostics, tsgoCheck, bunCheck } from "../src/toolchain";

describe("parseTsDiagnostics", () => {
  it("parses tsgo/tsc diagnostic lines", () => {
    const raw = [
      "src/foo.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/bar.ts: error TS2304: Cannot find name 'x'.",
    ].join("\n");
    const d = parseTsDiagnostics(raw);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ file: "src/foo.ts", line: 3, column: 5, severity: "error", code: "TS2322" });
    expect(d[1].code).toBe("TS2304");
  });
  it("returns empty for clean output", () => {
    expect(parseTsDiagnostics("")).toEqual([]);
  });
});

describe("tsgoCheck", () => {
  it("runs tsgo --noEmit over the fluxling-transform project", async () => {
    const r = await tsgoCheck(import.meta.dir + "/..");
    expect(typeof r.ok).toBe("boolean");
    expect(Array.isArray(r.diagnostics)).toBe(true);
  });
});

describe("bunCheck", () => {
  it("reports a bun version", async () => {
    const r = await bunCheck();
    expect(r.ok).toBe(true);
    expect(r.version.length).toBeGreaterThan(0);
  });
});