// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisBundle,
  JobMatchBundle,
  RenderResponse,
} from "@/lib/client/contracts";
import { useAppStore } from "@/lib/client/store";

const api = vi.hoisted(() => ({
  downloadVerifiedResume: vi.fn(),
  recommendLayout: vi.fn(),
  renderResume: vi.fn(),
}));

vi.mock("@/lib/client/api", () => api);

import { exportConfirmationBlocker, TemplateExport } from "./template-export";

afterEach(() => {
  cleanup();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

function downloadableAnalysisFixture() {
  return {
    resume: {
      id: "resume-download",
      revision: 2,
      originalFileName: "candidate.pdf",
      mimeType: "application/pdf",
      locale: "zh-CN",
      pageCount: 1,
      parseMethod: "native",
      sourceBlocks: [],
      ast: {
        schemaVersion: "1.0",
        locale: "zh-CN",
        contact: { name: "候选人", links: [] },
        sections: [],
      },
      parsingWarnings: [],
    },
    claims: [],
    evidence: [],
    suggestions: [],
    stories: [],
    originalPdfBase64: "JVBERi0=",
    scorecard: {
      resumeId: "resume-download",
      resumeRevision: 2,
      total: 80,
      summary: "测试",
      dimensions: [],
    },
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
  } as unknown as AnalysisBundle;
}

function downloadableRenderFixture(): RenderResponse {
  const sha256 = "a".repeat(64);
  const hardGate = { passed: true, blockingCheckIds: [] };
  return {
    template: "professional",
    pdfBase64: "JVBERi0=",
    sha256,
    byteLength: 8,
    searchableText: true,
    astContentCovered: true,
    hardGate,
    report: {
      resumeId: "resume-download",
      resumeRevision: 2,
      template: "professional",
      artifactSha256: sha256,
      sourcePageCount: 1,
      pageCount: 1,
      downloadable: true,
      searchableText: true,
      contentComplete: true,
      hardGate,
      overallScore: 100,
      checks: [{ id: "content", label: "内容完整", status: "pass" }],
      generatedAt: "2026-07-23T00:00:00.000Z",
    },
  };
}

describe("exportConfirmationBlocker", () => {
  const valid = {
    hasOriginalPdf: true,
    hardGatePassed: true,
    downloadable: true,
    astContentCovered: true,
    previewed: true,
  };

  it("allows confirmation only after original and generated previews are available", () => {
    expect(exportConfirmationBlocker(valid)).toBeNull();
  });

  it("blocks a history record whose original PDF has been released", () => {
    expect(
      exportConfirmationBlocker({ ...valid, hasOriginalPdf: false }),
    ).toMatch(/重新附加原 PDF/);
  });

  it("blocks unverified or failed generated artifacts", () => {
    expect(exportConfirmationBlocker({ ...valid, previewed: false })).toMatch(
      /像素验证/,
    );
    expect(
      exportConfirmationBlocker({ ...valid, hardGatePassed: false }),
    ).toMatch(/致命导出错误/);
    expect(
      exportConfirmationBlocker({
        ...valid,
        hardGatePassed: false,
        blockingChecks: [
          {
            id: "missing-glyphs",
            label: "字形完整性",
            status: "fail",
            details: "发现非原文的缺失字形标记。",
          },
        ],
      }),
    ).toBe(
      "当前 PDF 未通过“字形完整性”：发现非原文的缺失字形标记。",
    );
  });
});

describe("TemplateExport resume target", () => {
  it("renders the selected job variant AST through the existing quality-gated pipeline", async () => {
    const baseAst = {
      schemaVersion: "1.0" as const,
      locale: "zh-CN" as const,
      contact: { name: "候选人", links: [] },
      sections: [
        {
          id: "education",
          type: "education" as const,
          title: "教育背景",
          entries: [],
          sourceBlockIds: [],
        },
        {
          id: "experience",
          type: "experience" as const,
          title: "工作经历",
          entries: [],
          sourceBlockIds: [],
        },
      ],
    };
    const variantAst = {
      ...baseAst,
      sections: [...baseAst.sections].reverse(),
    };
    const analysis = {
      resume: {
        id: "resume-export",
        revision: 4,
        originalFileName: "candidate.pdf",
        mimeType: "application/pdf",
        locale: "zh-CN",
        pageCount: 1,
        parseMethod: "native",
        sourceBlocks: [],
        ast: baseAst,
        parsingWarnings: [],
      },
      claims: [],
      evidence: [],
      suggestions: [],
      stories: [],
      originalPdfBase64: "JVBERi0=",
      scorecard: {
        resumeId: "resume-export",
        resumeRevision: 4,
        total: 80,
        summary: "测试",
        dimensions: [],
      },
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
    } as unknown as AnalysisBundle;
    const jobMatch = {
      sourceResumeId: "resume-export",
      sourceResumeRevision: 4,
      job: {
        id: "job-export",
        title: "产品经理",
        locale: "zh-CN",
        rawText: "产品经理岗位要求数据分析经验。",
      },
      requirements: [],
      mappings: [],
      coverage: 80,
      summary: "仅表示材料适配。",
      riskFlags: [],
      capabilityVersions: {
        "jd.parse": "jd.parse@2.0.0",
        "job.match": "job.match@2.0.0",
      },
      variant: {
        id: "variant-export",
        baseResumeId: "resume-export",
        baseRevision: 4,
        revision: 0,
        jobPostingId: "job-export",
        name: "产品经理定制版",
        ast: variantAst,
        appliedSuggestionIds: [],
        changes: [
          {
            id: "change-export",
            kind: "section_reorder",
            path: "/sections",
            beforeIds: ["education", "experience"],
            afterIds: ["experience", "education"],
            requirementIds: [],
            claimIds: [],
            explanation: "相关经历前置。",
          },
        ],
      },
    } as JobMatchBundle;
    useAppStore.setState({
      stage: "workspace",
      analysis,
      jobMatch,
      activeResumeVariantId: "variant-export",
      resumePanel: "templates",
      selectedTemplate: "professional",
      renders: {},
    });
    api.recommendLayout.mockResolvedValue({
      recommendedTemplate: "professional",
      estimatedPages: 1,
      density: "balanced",
      reasons: ["测试"],
      rankings: [
        { template: "professional", score: 90, estimatedPages: 1 },
        { template: "minimal", score: 80, estimatedPages: 1 },
        { template: "compact", score: 70, estimatedPages: 1 },
      ],
    });
    api.renderResume.mockReturnValue(new Promise(() => undefined));
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const user = userEvent.setup();

    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(TemplateExport),
      ),
    );
    expect(screen.getByText(/正在处理产品经理定制版/)).toBeInTheDocument();
    expect(
      screen.getByText(/检查基准：当前最新版本 r0/),
    ).toBeInTheDocument();
    expect(await screen.findByText("测试")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "生成 Professional PDF" }),
    );

    await waitFor(() =>
      expect(api.renderResume).toHaveBeenCalledWith(
        expect.objectContaining({
          resumeId: "variant-export",
          revision: 0,
          ast: variantAst,
        }),
      ),
    );
    expect(api.renderResume).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourcePageCount: expect.anything() }),
    );
    expect(screen.getByRole("button", { name: /^Minimal/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Compact/ })).toBeDisabled();
    expect(
      screen.getByRole("progressbar", { name: "PDF 生成预估进度" }),
    ).toBeInTheDocument();
  });

  it("locks template and regeneration controls while download review is pending", async () => {
    const analysis = downloadableAnalysisFixture();
    const renderResult = downloadableRenderFixture();
    useAppStore.setState({
      stage: "workspace",
      analysis,
      jobMatch: null,
      activeResumeVariantId: null,
      resumePanel: "templates",
      selectedTemplate: "professional",
      renders: { professional: renderResult },
      previewedRenderHashes: [renderResult.sha256],
    });
    api.recommendLayout.mockResolvedValue({
      recommendedTemplate: "professional",
      estimatedPages: 1,
      density: "balanced",
      reasons: ["测试"],
      rankings: [
        { template: "professional", score: 90, estimatedPages: 1 },
        { template: "minimal", score: 80, estimatedPages: 1 },
        { template: "compact", score: 70, estimatedPages: 1 },
      ],
    });
    api.downloadVerifiedResume.mockReturnValue(new Promise(() => undefined));
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const user = userEvent.setup();

    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(TemplateExport),
      ),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /已对照原版，确认将当前模板用于最终下载/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "下载最终 PDF" }));

    await waitFor(() => expect(api.downloadVerifiedResume).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "重新生成预览" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Minimal/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Compact/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "正在校验文件" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: /已对照原版，确认将当前模板用于最终下载/,
      }),
    ).toBeDisabled();
  });
});
