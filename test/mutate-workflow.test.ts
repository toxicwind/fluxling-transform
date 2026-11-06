import { describe, it, expect } from "bun:test";
import { mutateDiff, mutateStream } from "../src/mutate.ts";
import { runChecks } from "../src/workflow.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("fluxling-transform mutate", () => {
  it("produces a deterministic diff for a given seed", () => {
    const files = { "app.py": "def hello():\n    pass\n" };
    const [goal1, diff1] = mutateDiff(files, undefined, 3);
    const [goal2, diff2] = mutateDiff(files, undefined, 3);
    expect(goal1).toBe(goal2);
    expect(diff1).toBe(diff2);
    expect(goal1).toBeTruthy();
    expect(diff1).toContain("--- a/app.py");
  });

  it("applies a named rule only", () => {
    const files = { "app.py": "def hello():\n    pass\n" };
    const [goal, diff] = mutateDiff(files, "rename_function", 0);
    expect(goal).toContain("Rename");
    expect(diff).toContain("hello_v");
  });

  it("returns null when no rule applies", () => {
    const [goal, diff] = mutateDiff({ "README.md": "no python here" }, undefined, 0);
    expect(goal).toBeNull();
    expect(diff).toBeNull();
  });

  it("chained stream applies each mutation to the previous result", () => {
    const files = { "app.py": "def hello():\n    pass\n" };
    const steps = [...mutateStream(files, 3, 0)];
    expect(steps.length).toBeGreaterThan(0);
    // Each step's files should differ from the previous.
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].files["app.py"]).not.toBe(steps[i - 1].files["app.py"]);
    }
  });
});

describe("fluxling-transform workflow", () => {
  it("runChecks passes when all commands exit 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fluxling-wf-"));
    try {
      writeFileSync(join(dir, "ok.py"), "print('ok')\n");
      const [allOk, results] = await runChecks(dir, [["syntax", ["python3", "-c", "import ast,sys; ast.parse(open('ok.py').read())"]]]);
      expect(allOk).toBe(true);
      expect(results[0].ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runChecks fails on a failing command", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fluxling-wf-"));
    try {
      const [allOk, results] = await runChecks(dir, [["bad", ["false"]]]);
      expect(allOk).toBe(false);
      expect(results[0].ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});