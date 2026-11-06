import { describe, it, expect } from "bun:test";
import { smartapply, resolvePath, stripBadOutput } from "../src/core.ts";
import { parseDiffPerFile } from "../src/applydiff.ts";
import { extractDiffBlock, buildEnvironment, projectSystemPrompt } from "../src/llm.ts";

describe("fluxling-transform core", () => {
  it("smartapply applies a simple diff", () => {
    const diff = `--- a/a.py\n+++ b/a.py\n@@ -1,1 +1,2 @@\n x\n+y`;
    const out = smartapply(diff, { "a.py": "x" });
    expect(out["a.py"]).toBe("x\ny");
  });

  it("smartapply handles a removal hunk", () => {
    const diff = `--- a/a.py\n+++ b/a.py\n@@ -1,2 +1,1 @@\n x\n-y`;
    const out = smartapply(diff, { "a.py": "x\ny" });
    expect(out["a.py"]).toBe("x");
  });

  it("smartapply omits deleted files", () => {
    const diff = `--- a/a.py\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-x`;
    const out = smartapply(diff, { "a.py": "x" });
    expect(out["a.py"]).toBeUndefined();
  });

  it("resolvePath matches by suffix for LLM temp paths", () => {
    const files = { "src/agent.ts": "content", "src/util.ts": "other" };
    expect(resolvePath("b/src/agent.ts", files, "")).toBe("src/agent.ts");
  });

  it("resolvePath matches by content fingerprint", () => {
    const files = { "src/agent.ts": "const x = 1;\nfunction foo() {}", "src/util.ts": "other" };
    const patch = "--- a/agent.ts\n+++ b/agent.ts\n@@ -1,1 +1,1 @@\n function foo() {}";
    expect(resolvePath("agent.ts", files, patch)).toBe("src/agent.ts");
  });
});

describe("fluxling-transform applydiff", () => {
  it("parses a multi-file diff into per-file patches", () => {
    const diff = `diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -1,1 +1,1 @@\n-x\n+y\ndiff --git a/b.py b/b.py\n--- a/b.py\n+++ b/b.py\n@@ -1,1 +1,1 @@\n-a\n+b`;
    const parsed = parseDiffPerFile(diff);
    expect(parsed.length).toBe(2);
    expect(parsed[0][0]).toBe("a.py");
    expect(parsed[1][0]).toBe("b.py");
  });
});

describe("fluxling-transform llm", () => {
  it("extracts a diff block", () => {
    const text = 'Here:\n```diff\n--- a/a.py\n+++ b/a.py\n@@ -1 +1 @@\n-x\n+y\n```\nDone';
    expect(extractDiffBlock(text)).toContain("--- a/a.py");
  });

  it("builds a project environment", () => {
    const env = buildEnvironment({ "a.py": "x" });
    expect(env).toContain("FILE a.py:");
  });

  it("project system prompt enforces the diff output contract", () => {
    const prompt = projectSystemPrompt();
    expect(prompt).toContain("```diff");
    expect(prompt).toContain("MINIMAL change");
    expect(prompt).toContain("Context lines must be copied EXACTLY");
  });
});