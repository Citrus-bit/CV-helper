import { describe, expect, it } from "vitest";

import { SuggestionSchema } from "@/lib/domain";
import {
  evidenceAnswerIsValid,
  suggestionStatusMessage,
} from "./suggestion-review";

function suggestion(input: Record<string, unknown> = {}) {
  return SuggestionSchema.parse({
    id: "suggestion-1",
    resumeRevision: 0,
    sourceBlockIds: ["block-1"],
    claimIds: ["claim-1"],
    kind: "rewrite",
    status: "accepted",
    originalText: "建设发布流程并支持团队交付",
    proposedText: "建设发布流程，将平均发布时间缩短 30%",
    rationale: "补充可核实结果。",
    beforeHash: "hash-1",
    patches: [],
    affectedDimensions: ["impact"],
    factRisk: "medium",
    interviewRisk: "low",
    ...input,
  });
}

describe("suggestion status copy", () => {
  it("does not claim that an accepted no-op changed the resume", () => {
    const original = "建设发布流程并支持团队交付";
    expect(
      suggestionStatusMessage(suggestion({ proposedText: original })),
    ).toBe("这条内容已确认，简历文字保持原样。");
  });

  it("reports a real accepted replacement as applied", () => {
    expect(suggestionStatusMessage(suggestion())).toBe(
      "这条建议已应用，可使用顶部撤销按钮恢复。",
    );
  });
});

describe("evidence answer validation", () => {
  it("requires a deliberate answer instead of accepting the pre-existing claim", () => {
    const original = "负责发布流程建设";

    expect(evidenceAnswerIsValid("", original)).toBe(false);
    expect(evidenceAnswerIsValid("  负责发布流程建设  ", original)).toBe(false);
    expect(
      evidenceAnswerIsValid(
        "负责发布流程建设，并通过复盘记录确认交付周期缩短。",
        original,
      ),
    ).toBe(true);
  });
});
