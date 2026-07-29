// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stableId } from "@/lib/baseline/utils";
import type { AnalysisBundle } from "@/lib/client/contracts";
import { useAppStore } from "@/lib/client/store";

const mocks = vi.hoisted(() => ({
  analyzeResumeRevision: vi.fn(),
  generateEvidenceRewrite: vi.fn(),
  renderResume: vi.fn(),
}));

vi.mock("@/lib/client/api", () => ({
  analyzeResumeRevision: mocks.analyzeResumeRevision,
  generateEvidenceRewrite: mocks.generateEvidenceRewrite,
  renderResume: mocks.renderResume,
}));

import { SuggestionReview } from "./suggestion-review";

function analysisFixture(): AnalysisBundle {
  const originalText = "将接口响应时间从 500ms 降低至 150ms。";
  return {
    resume: {
      id: "resume-evidence-dialog",
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
          text: originalText,
          bbox: { x: 0.1, y: 0.2, width: 0.8, height: 0.05 },
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
            id: "projects",
            type: "projects",
            title: "项目经历",
            sourceBlockIds: ["block-1"],
            entries: [
              {
                id: "project-1",
                title: "秒杀系统",
                current: false,
                bullets: [originalText],
                keywords: [],
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
      resumeId: "resume-evidence-dialog",
      resumeRevision: 0,
      total: 70,
      summary: "需要补充压测口径。",
      dimensions: [
        ["impact", 15, 25],
        ["completeness", 11, 15],
        ["clarity", 11, 15],
        ["structure", 11, 15],
        ["ats", 11, 15],
        ["language", 11, 15],
      ].map(([id, score, maxScore]) => ({
        id: id as
          | "impact"
          | "completeness"
          | "clarity"
          | "structure"
          | "ats"
          | "language",
        label: String(id),
        score: Number(score),
        maxScore: Number(maxScore),
        evidence: [],
        deductions: [],
      })),
    },
    suggestions: [
      {
        id: "suggestion-1",
        resumeRevision: 0,
        sourceBlockIds: ["block-1"],
        claimIds: [],
        kind: "needs_proof",
        status: "pending",
        originalText,
        rationale: "性能数据缺少可核对的压测口径。",
        question: "这个数据来自什么压测场景？",
        beforeHash: stableId("hash", originalText),
        patches: [
          {
            operation: "replace",
            path: "/sections/0/entries/0/bullets/0",
            value: originalText,
          },
        ],
        affectedDimensions: ["impact"],
        scoreGain: 30,
        factRisk: "high",
        interviewRisk: "high",
      },
    ],
    stories: [],
    processing: {
      extractionMode: "native",
      durationMs: 1,
      capabilityVersions: {
        "resume.score": "resume.score@2.0.0",
        "resume.suggest": "resume.suggest@2.0.0",
      },
      aiAnalysis: {
        status: "fresh",
        analyzedRevision: 0,
        scoreSourceVersion: "resume.score@2.0.0",
        suggestionSourceVersion: "resume.suggest@2.0.0",
      },
    },
  };
}

afterEach(() => {
  cleanup();
  mocks.generateEvidenceRewrite.mockReset();
  mocks.renderResume.mockReset();
  mocks.analyzeResumeRevision.mockReset();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
});

describe("evidence rewrite dialog", () => {
  it("applies the safe rewrite batch without starting a second AI analysis", async () => {
    const analysis = analysisFixture();
    const originalText = analysis.resume.ast.sections[0].entries[0].bullets[0];
    const proposedText =
      "优化接口调用链路，将响应时间从 500ms 降低至 150ms。";
    analysis.suggestions = [
      {
        id: "suggestion-safe-1",
        resumeRevision: 0,
        sourceBlockIds: ["block-1"],
        claimIds: [],
        kind: "rewrite",
        status: "pending",
        originalText,
        proposedText,
        rationale: "调整动作顺序，让性能优化结果更容易扫描。",
        beforeHash: stableId("hash", originalText),
        patches: [
          {
            operation: "replace",
            path: "/sections/0/entries/0/bullets/0",
            value: proposedText,
          },
        ],
        affectedDimensions: ["clarity"],
        scoreGain: 30,
        factRisk: "none",
        interviewRisk: "none",
      },
    ];
    mocks.renderResume.mockResolvedValue({
      template: "compact",
      pdfBase64: "JVBERi0xLjQK",
      sha256: "rendered-safe-batch",
      report: {
        resumeId: analysis.resume.id,
        resumeRevision: 1,
        template: "compact",
        artifactSha256: "rendered-safe-batch",
        downloadable: true,
        score: 100,
        pageCount: 1,
        checks: [],
      },
      hardGate: { passed: true, blockingCheckIds: [] },
      astContentCovered: true,
    });
    useAppStore.getState().setAnalysis(analysis);
    const user = userEvent.setup();
    render(createElement(SuggestionReview));

    await user.click(
      screen.getByRole("button", { name: "一键优化 1 处" }),
    );

    expect(
      useAppStore.getState().analysis?.resume.ast.sections[0].entries[0]
        .bullets[0],
    ).toBe(proposedText);
    expect(useAppStore.getState().analysis?.suggestions[0].status).toBe(
      "accepted",
    );
    expect(
      await screen.findByText(/已应用 1 处安全改写并生成新版 PDF/),
    ).toBeVisible();
    expect(mocks.renderResume).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1, template: "compact" }),
    );
    expect(useAppStore.getState()).toMatchObject({
      previewMode: "current",
      resumePanel: "templates",
      renders: { compact: { sha256: "rendered-safe-batch" } },
    });
    expect(useAppStore.getState().analysis?.scorecard.total).toBe(70);
    expect(useAppStore.getState().analysis?.processing.aiAnalysis?.status).not.toBe(
      "fresh",
    );
    expect(mocks.analyzeResumeRevision).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /最终评分/ })).toBeNull();
  });

  it("generates a reviewable paragraph from supplemental facts without a linked claim", async () => {
    const rewrittenText =
      "使用 JMeter 在 QPS 1000 场景下完成压测，将接口响应时间从 500ms 降低至 150ms。";
    mocks.generateEvidenceRewrite.mockResolvedValue({
      resumeId: "resume-evidence-dialog",
      resumeRevision: 0,
      suggestionId: "suggestion-1",
      rewrittenText,
      sourceVersion: "copy.rewrite.zh@2.0.0",
      durationMs: 900,
    });
    useAppStore.getState().setAnalysis(analysisFixture());
    const user = userEvent.setup();
    render(createElement(SuggestionReview));

    await user.click(screen.getByRole("button", { name: "补充事实" }));
    const generateButton = screen.getByRole("button", {
      name: "AI 生成待审阅改写",
    });
    expect(generateButton).toBeDisabled();

    await user.type(
      screen.getByRole("textbox", { name: "补充事实或背景" }),
      "使用 JMeter，压测场景的 QPS 大约为 1000。",
    );
    expect(generateButton).toBeEnabled();
    await user.click(generateButton);

    await waitFor(() => {
      expect(mocks.generateEvidenceRewrite).toHaveBeenCalledOnce();
      expect(screen.getByText(rewrittenText)).toBeVisible();
    });
    expect(useAppStore.getState().analysis?.suggestions[0]).toMatchObject({
      kind: "rewrite",
      status: "pending",
      proposedText: rewrittenText,
      claimIds: [expect.stringMatching(/^claim-user_/)],
    });
  });
});
