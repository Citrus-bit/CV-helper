// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { stableId } from "@/lib/baseline/utils";
import { SuggestionSchema, type ScoreDimensionId } from "@/lib/domain";
import type { AnalysisBundle } from "./contracts";
import {
  resumeChatInputForMessage,
  useAppStore,
} from "./store";

const dimensionIds: ScoreDimensionId[] = [
  "impact",
  "completeness",
  "clarity",
  "structure",
  "ats",
  "language",
];

function analysisFixture(): AnalysisBundle {
  return {
    resume: {
      id: "resume-chat-store",
      revision: 0,
      originalFileName: "resume.pdf",
      mimeType: "application/pdf",
      locale: "zh-CN",
      pageCount: 1,
      parseMethod: "native",
      sourceBlocks: [
        {
          id: "block-1",
          pageIndex: 0,
          order: 0,
          text: "主要负责平台开发",
          bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.03 },
          source: "native",
          confidence: 1,
          role: "list-item",
        },
      ],
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
                keywords: ["平台"],
                sourceBlockIds: ["block-1"],
              },
            ],
          },
        ],
      },
      parsingWarnings: [],
    },
    evidence: [],
    claims: [],
    scorecard: {
      resumeId: "resume-chat-store",
      resumeRevision: 0,
      total: 60,
      summary: "待优化",
      dimensions: dimensionIds.map((id) => ({
        id,
        label: id,
        score: 10,
        maxScore: id === "impact" ? 25 : 15,
        evidence: [],
        deductions: [],
      })),
    },
    suggestions: [],
    stories: [],
    pagePreviews: [],
    processing: {
      extractionMode: "native",
      durationMs: 1,
      capabilityVersions: {},
    },
  };
}

afterEach(() => {
  useAppStore.getState().reset();
  window.sessionStorage.clear();
});

describe("resume chat context", () => {
  it("keeps full local history while sending only the last ten messages", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    let latestId = "";
    for (let index = 1; index <= 12; index += 1) {
      latestId = useAppStore.getState().beginResumeChatTurn(`第 ${index} 轮修改`)!.id;
    }

    const state = useAppStore.getState();
    const input = resumeChatInputForMessage(
      state.analysis!,
      state.resumeChat!,
      latestId,
    );

    expect(state.resumeChat?.messages).toHaveLength(12);
    expect(input.recentMessages).toHaveLength(10);
    expect(input.recentMessages[0].content).toBe("第 2 轮修改");
    expect(input.userMessage).toBe("第 12 轮修改");
  });

  it("stores the AI summary and applies a revision-bound chat rewrite", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    const message = useAppStore
      .getState()
      .beginResumeChatTurn("把这条经历写得更直接。")!;
    const suggestion = SuggestionSchema.parse({
      id: "chat-suggestion-1",
      resumeRevision: 0,
      sourceBlockIds: ["block-1"],
      claimIds: [],
      kind: "rewrite",
      status: "pending",
      originalText: "主要负责平台开发",
      proposedText: "负责平台开发",
      rationale: "删去弱化词，使职责表达更直接。",
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
    });

    expect(
      useAppStore.getState().completeResumeChatTurn(message.id, {
        reply: "这条可以直接删去“主要”。",
        summary: "用户希望工作经历表达更直接。",
        confirmedFacts: [],
        suggestions: [suggestion],
        sourceVersion: "resume.chat@2.0.0",
        durationMs: 100,
      }),
    ).toBe(true);

    expect(useAppStore.getState().resumeChat).toMatchObject({
      summary: "用户希望工作经历表达更直接。",
      messages: [
        { role: "user" },
        { role: "assistant", suggestionIds: ["chat-suggestion-1"] },
      ],
    });

    useAppStore.getState().setResumePanel("chat");
    useAppStore.getState().decideSuggestion("chat-suggestion-1", "accepted");

    expect(
      useAppStore.getState().analysis?.resume.ast.sections[0].entries[0]
        .bullets[0],
    ).toBe("负责平台开发");
    expect(useAppStore.getState().analysis?.resume.revision).toBe(1);
    expect(useAppStore.getState().resumePanel).toBe("chat");
    expect(useAppStore.getState().resumeChat?.recentChanges.at(-1)).toContain(
      "已将",
    );
  });

  it("marks an AI rewrite stale when the resume changed during the request", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    const message = useAppStore
      .getState()
      .beginResumeChatTurn("优化这条经历。")!;
    useAppStore.setState((state) => ({
      analysis: state.analysis
        ? {
            ...state.analysis,
            resume: { ...state.analysis.resume, revision: 1 },
          }
        : null,
    }));
    const suggestion = SuggestionSchema.parse({
      id: "chat-stale-1",
      resumeRevision: 0,
      sourceBlockIds: ["block-1"],
      claimIds: [],
      kind: "rewrite",
      status: "pending",
      originalText: "主要负责平台开发",
      proposedText: "负责平台开发",
      rationale: "收紧表达。",
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
    });

    useAppStore.getState().completeResumeChatTurn(message.id, {
      reply: "已给出改写。",
      summary: "用户要求优化经历。",
      confirmedFacts: [],
      suggestions: [suggestion],
      sourceVersion: "resume.chat@2.0.0",
      durationMs: 100,
    });

    expect(
      useAppStore
        .getState()
        .analysis?.suggestions.find((item) => item.id === "chat-stale-1")
        ?.status,
    ).toBe("stale");
  });
});
