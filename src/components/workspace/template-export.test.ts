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
    template: "compact",
    pdfBase64: "JVBERi0=",
    sha256,
    byteLength: 8,
    searchableText: true,
    astContentCovered: true,
    hardGate,
    report: {
      resumeId: "resume-download",
      resumeRevision: 2,
      template: "compact",
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
    ).toMatch(/完整性检查/);
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
    ).toBe("后台自动排版未通过“字形完整性”，请重新生成。");
    expect(
      exportConfirmationBlocker({
        ...valid,
        hardGatePassed: false,
        repairAttempts: 2,
        blockingChecks: [
          {
            id: "text-visibility",
            label: "文字视觉可读性",
            status: "fail",
          },
        ],
      }),
    ).toBe("已自动修复 2 轮，仍未通过“文字视觉可读性”，请检查原文后再生成。");
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
      selectedTemplate: "compact",
      renders: {},
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
    expect(screen.getByText("产品经理定制版 · 版本 1")).toBeInTheDocument();
    expect(screen.getByText("Compact 单页排版")).toBeInTheDocument();
    expect(screen.queryByText("排版模板")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "生成最终 PDF" }),
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
    expect(
      screen.getByRole("progressbar", { name: "PDF 生成预估进度" }),
    ).toBeInTheDocument();
  });

  it("locks regeneration while download review is pending", async () => {
    const analysis = downloadableAnalysisFixture();
    const renderResult = downloadableRenderFixture();
    useAppStore.setState({
      stage: "workspace",
      analysis,
      jobMatch: null,
      activeResumeVariantId: null,
      resumePanel: "templates",
      selectedTemplate: "compact",
      renders: { compact: renderResult },
      previewedRenderHashes: [renderResult.sha256],
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
        name: /已对照原版，确认下载当前最终版本/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "下载最终 PDF" }));

    await waitFor(() => expect(api.downloadVerifiedResume).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "重新生成最终 PDF" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "正在校验文件" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: /已对照原版，确认下载当前最终版本/,
      }),
    ).toBeDisabled();
  });

  it("shows when the downloadable artifact passed after AI repair", () => {
    const analysis = downloadableAnalysisFixture();
    const renderResult = downloadableRenderFixture();
    renderResult.generation = {
      attempts: 2,
      aiRepairApplied: true,
      aiRepairSourceVersion: "layout.recommend@2.0.0",
    };
    useAppStore.setState({
      stage: "workspace",
      analysis,
      jobMatch: null,
      activeResumeVariantId: null,
      resumePanel: "templates",
      selectedTemplate: "compact",
      renders: { compact: renderResult },
      previewedRenderHashes: [renderResult.sha256],
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(TemplateExport),
      ),
    );

    expect(screen.getByText("第 2 轮 · AI 修复通过")).toBeInTheDocument();
  });
});
