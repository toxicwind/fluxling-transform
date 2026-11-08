import { describe, expect, test } from "bun:test";
import { extractCodeBlock } from "../src/llm.ts";

describe("extractCodeBlock", () => {
	test("pulls the single fenced code block, discarding surrounding prose", () => {
		const raw = "Here is the module:\n```go\npackage server\n\nfunc X() {}\n```\nThat's all.";
		expect(extractCodeBlock(raw)).toBe("package server\n\nfunc X() {}");
	});

	test("handles a language tag on the fence", () => {
		const raw = "```typescript\nexport const a = 1;\n```";
		expect(extractCodeBlock(raw)).toBe("export const a = 1;");
	});

	test("returns trimmed text when no fence is present (degraded, non-throwing)", () => {
		expect(extractCodeBlock("  plain text  ")).toBe("plain text");
	});
});