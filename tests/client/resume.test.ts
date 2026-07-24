import { describe, expect, it } from "vitest";

import {
  ResumeASTSchema,
  SuggestionSchema,
  type Suggestion,
} from "@/lib/domain";
import { applySuggestion } from "@/lib/client/resume";
import { stableId } from "@/lib/baseline/utils";

const ast = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: { name: "候选人", links: [] },
  sections: [
    {
      id: "experience",
      type: "experience",
      title: "工作经历",
      sourceBlockIds: ["block-1"],
      entries: [
        {
          id: "entry-1",
          title: "工程师",
          current: false,
          bullets: ["主要负责平台开发", "重复描述"],
          keywords: [],
          sourceBlockIds: ["block-1"],
        },
        {
          id: "entry-2",
          title: "工程师",
          current: false,
          bullets: ["主要负责平台开发"],
          keywords: [],
          sourceBlockIds: ["block-2"],
        },
      ],
    },
  ],
});

function makeSuggestion(input: Partial<Suggestion> = {}) {
  return SuggestionSchema.parse({
    id: "suggestion-1",
    resumeRevision: 0,
    sourceBlockIds: ["block-1"],
    claimIds: [],
    kind: "rewrite",
    status: "accepted",
    originalText: "主要负责平台开发",
    proposedText: "负责平台开发",
    rationale: "压缩弱表达。",
    beforeHash: stableId("hash", input.originalText ?? "主要负责平台开发"),
    patches: [
      {
        operation: "replace",
        path: "/sections/0/entries/0/bullets/0",
        value: "负责平台开发",
      },
    ],
    affectedDimensions: ["clarity"],
    factRisk: "none",
    interviewRisk: "none",
    ...input,
  });
}

describe("applySuggestion", () => {
  it("applies a block-scoped JSON Pointer without replacing duplicate text elsewhere", () => {
    const result = applySuggestion(ast, makeSuggestion());

    expect(result.sections[0].entries[0].bullets[0]).toBe("负责平台开发");
    expect(result.sections[0].entries[1].bullets[0]).toBe("主要负责平台开发");
  });

  it("uses the reviewed manual text for the scoped patch", () => {
    const result = applySuggestion(
      ast,
      makeSuggestion({
        status: "manual",
        proposedText: "负责平台能力建设与交付",
      }),
    );

    expect(result.sections[0].entries[0].bullets[0]).toBe(
      "负责平台能力建设与交付",
    );
  });

  it("supports removing a single array item", () => {
    const result = applySuggestion(
      ast,
      makeSuggestion({
        kind: "remove",
        proposedText: undefined,
        originalText: "重复描述",
        patches: [
          { operation: "remove", path: "/sections/0/entries/0/bullets/1" },
        ],
      }),
    );

    expect(result.sections[0].entries[0].bullets).toEqual(["主要负责平台开发"]);
  });

  it("preserves the AST identity when a valid patch does not change its value", () => {
    const result = applySuggestion(
      ast,
      makeSuggestion({
        proposedText: "主要负责平台开发",
        patches: [
          {
            operation: "replace",
            path: "/sections/0/entries/0/bullets/0",
            value: "主要负责平台开发",
          },
        ],
      }),
    );

    expect(result).toBe(ast);
  });

  it("rejects unsafe pointer segments and leaves the AST unchanged", () => {
    const result = applySuggestion(
      ast,
      makeSuggestion({
        patches: [
          {
            operation: "replace",
            path: "/sections/__proto__/polluted",
            value: true,
          },
        ],
      }),
    );

    expect(result).toBe(ast);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("rejects a valid pointer when beforeHash no longer matches its current value", () => {
    const stale = makeSuggestion({
      beforeHash: stableId("hash", "较早版本的文字"),
    });

    expect(applySuggestion(ast, stale)).toBe(ast);
  });
});
