// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalysisBundle } from "@/lib/client/contracts";
import { JobMatchBundleSchema } from "@/lib/client/contracts";
import { useAppStore } from "@/lib/client/store";

const api = vi.hoisted(() => ({
  matchJob: vi.fn(),
}));

vi.mock("@/lib/client/api", () => api);

import { JobWorkspace } from "./job-workspace";

const dimensions = [
  "impact",
  "completeness",
  "clarity",
  "structure",
  "ats",
  "language",
] as const;

function analysisFixture(): AnalysisBundle {
  return {
    resume: {
      id: "resume-job-ui",
      revision: 3,
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
        sections: [
          {
            id: "education",
            type: "education",
            title: "教育背景",
            sourceBlockIds: [],
            entries: [],
          },
          {
            id: "experience",
            type: "experience",
            title: "工作经历",
            sourceBlockIds: ["block-sql"],
            entries: [
              {
                id: "role-sql",
                title: "产品经理",
                current: true,
                bullets: ["使用 SQL 完成漏斗分析"],
                keywords: ["SQL"],
                sourceBlockIds: ["block-sql"],
              },
            ],
          },
        ],
      },
      parsingWarnings: [],
    },
    evidence: [
      {
        id: "evidence-sql",
        kind: "resume_text",
        label: "第 1 页原文",
        content: "使用 SQL 完成漏斗分析",
        sourceBlockIds: ["block-sql"],
        verifiedByUser: false,
        confidence: 0.98,
      },
    ],
    claims: [
      {
        id: "claim-sql",
        text: "使用 SQL 完成漏斗分析",
        sourceBlockIds: ["block-sql"],
        evidenceAssetIds: ["evidence-sql"],
        status: "supported",
        confidence: 0.9,
        missingInformation: [],
      },
    ],
    scorecard: {
      resumeId: "resume-job-ui",
      resumeRevision: 3,
      total: 80,
      summary: "测试",
      dimensions: dimensions.map((id) => ({
        id,
        label: id,
        score: 10,
        maxScore: 20,
        evidence: [],
        deductions: [],
      })),
    },
    suggestions: [],
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

function jobMatchFixture(analysis: AnalysisBundle) {
  return JobMatchBundleSchema.parse({
    sourceResumeId: analysis.resume.id,
    sourceResumeRevision: analysis.resume.revision,
    job: {
      id: "job-sql",
      title: "数据产品经理",
      company: "示例公司",
      locale: "zh-CN",
      rawText:
        "数据产品经理岗位，要求熟练使用 SQL 完成产品数据分析与跨团队交付。",
    },
    requirements: [
      {
        id: "requirement-sql",
        jobPostingId: "job-sql",
        category: "must_have",
        text: "熟练使用 SQL 完成产品数据分析",
        keywords: ["SQL", "数据分析"],
        importance: 1,
      },
    ],
    mappings: [
      {
        requirementId: "requirement-sql",
        status: "met",
        claimIds: ["claim-sql"],
        evidenceAssetIds: ["evidence-sql"],
        explanation: "SQL 经历已有可追溯证据。",
        confidence: 0.9,
      },
    ],
    coverage: 100,
    summary: "证据覆盖率不代表录取概率。",
    riskFlags: [],
    capabilityVersions: {
      "jd.parse": "jd.parse@2.0.0",
      "job.match": "job.match@2.0.0",
    },
    variant: {
      id: "variant-sql",
      baseResumeId: analysis.resume.id,
      baseRevision: analysis.resume.revision,
      revision: 0,
      jobPostingId: "job-sql",
      name: "数据产品经理定制版",
      ast: {
        ...analysis.resume.ast,
        sections: [...analysis.resume.ast.sections].reverse(),
      },
      appliedSuggestionIds: [],
      changes: [
        {
          id: "change-sections",
          kind: "section_reorder",
          path: "/sections",
          beforeIds: ["education", "experience"],
          afterIds: ["experience", "education"],
          requirementIds: ["requirement-sql"],
          claimIds: ["claim-sql"],
          explanation: "将与 SQL 要求相关的工作经历前置，原文保持不变。",
        },
      ],
    },
  });
}

afterEach(() => {
  cleanup();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

describe("JobWorkspace job variant workflow", () => {
  it("shows requirement-to-evidence text and opens both resume versions", async () => {
    const analysis = analysisFixture();
    const jobMatch = jobMatchFixture(analysis);
    useAppStore.getState().setAnalysis(analysis);
    useAppStore.getState().setJobMatch(jobMatch);
    const user = userEvent.setup();
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
        createElement(JobWorkspace),
      ),
    );

    expect(
      screen.getByText("熟练使用 SQL 完成产品数据分析"),
    ).toBeInTheDocument();
    await user.click(screen.getByText("查看匹配依据"));
    expect(screen.getByText("对应简历声明")).toBeInTheDocument();
    expect(
      screen.getByText("使用 SQL 完成漏斗分析", { selector: "q" }),
    ).toBeVisible();
    expect(screen.getByText(/第 1 页原文：/)).toBeVisible();
    expect(screen.getByText("AI 已完成岗位分析")).toBeInTheDocument();
    await user.click(screen.getByText("查看 1 项调整"));
    expect(
      screen.getByText(/更新目标岗位并优先展示匹配内容/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /预览并下载岗位版/ }));
    expect(useAppStore.getState()).toMatchObject({
      module: "resume",
      activeResumeVariantId: "variant-sql",
      resumePanel: "templates",
      previewMode: "current",
    });
  });

  it("keeps the submitted JD read-only until its matching result settles", async () => {
    const analysis = analysisFixture();
    const jobMatch = jobMatchFixture(analysis);
    let resolveMatch: ((value: typeof jobMatch) => void) | undefined;
    api.matchJob.mockReturnValue(
      new Promise<typeof jobMatch>((resolve) => {
        resolveMatch = resolve;
      }),
    );
    useAppStore.getState().setAnalysis(analysis);
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
        createElement(JobWorkspace),
      ),
    );

    const input = screen.getByRole("textbox", { name: "岗位描述" });
    await user.click(
      screen.getByText("补充职位名、职级等信息（可选）"),
    );
    await user.type(
      screen.getByRole("textbox", { name: "职位名称" }),
      "高级数据产品经理",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "职级" }),
      "senior",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "输出语言" }),
      "zh-CN",
    );
    await user.type(screen.getByRole("textbox", { name: "工作地点" }), "上海");
    await user.type(
      input,
      "数据产品经理岗位，要求熟练使用 SQL 完成产品数据分析与跨团队交付。",
    );
    await user.click(
      screen.getByRole("button", { name: "分析并生成岗位版" }),
    );

    await waitFor(() => expect(api.matchJob).toHaveBeenCalledOnce());
    expect(api.matchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: "高级数据产品经理",
        seniority: "高级 / 资深",
        location: "上海",
        language: "zh-CN",
      }),
    );
    expect(input).toHaveAttribute("readonly");
    expect(
      screen.getByRole("button", { name: /正在分析岗位/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("progressbar", { name: "岗位匹配预估进度" }),
    ).toBeInTheDocument();

    await act(async () => resolveMatch?.(jobMatch));

    await waitFor(() => expect(input).not.toHaveAttribute("readonly"));
    expect(
      screen.getByText("数据产品经理", { selector: "h2" }),
    ).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "职位名称" }),
      "（新草稿）",
    );
    expect(useAppStore.getState()).toMatchObject({
      jobMatch: null,
      activeResumeVariantId: null,
      interviewPlan: null,
    });
    expect(screen.getByText("要求与证据逐项对应")).toBeInTheDocument();
  });
});
