import { describe, expect, it } from "vitest";

import type { AnalysisBundle } from "./contracts";
import { stableId } from "@/lib/baseline/utils";
import { safeAiRewriteSuggestions, suggestionGenerationSource } from "./suggestions";

function analysisFixture(sourceVersion = "resume.suggest@2.0.0") {
  return {
    resume: {
      id: "resume-1",
      revision: 0,
      ast: {
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
                current: true,
                bullets: ["主要负责平台开发"],
                keywords: [],
                sourceBlockIds: ["block-1"],
              },
            ],
          },
        ],
      },
    },
    suggestions: [
      {
        id: "suggestion-1",
        resumeRevision: 0,
        sourceBlockIds: ["block-1"],
        claimIds: [],
        kind: "rewrite",
        status: "pending",
        originalText: "主要负责平台开发",
        proposedText: "负责平台开发",
        rationale: "删去“主要”这一弱化词，让职责表达更直接。",
        beforeHash: stableId("hash", "主要负责平台开发"),
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
      },
    ],
    processing: {
      capabilityVersions: { "resume.suggest": sourceVersion },
    },
  } as unknown as AnalysisBundle;
}

describe("AI suggestion source and bulk eligibility", () => {
  it("only exposes provider-generated safe rewrites for one-click apply", () => {
    const analysis = analysisFixture();

    expect(suggestionGenerationSource(analysis)).toBe("ai");
    expect(safeAiRewriteSuggestions(analysis).map((item) => item.id)).toEqual([
      "suggestion-1",
    ]);
  });

  it("does not present baseline rule output as AI", () => {
    const analysis = analysisFixture("resume.suggest@1.0.0");

    expect(suggestionGenerationSource(analysis)).toBe("rules");
    expect(safeAiRewriteSuggestions(analysis)).toEqual([]);
  });
});
