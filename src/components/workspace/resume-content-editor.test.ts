// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalysisBundle, RenderResponse } from "@/lib/client/contracts";
import { useAppStore } from "@/lib/client/store";

const api = vi.hoisted(() => ({ renderResume: vi.fn() }));
vi.mock("@/lib/client/api", () => api);

import { ResumeContentEditor } from "./resume-content-editor";

function analysisFixture(withBrokenLines = true): AnalysisBundle {
  const bulletBlocks = withBrokenLines
    ? [
        {
          id: "bullet-start",
          pageIndex: 0,
          order: 0,
          text: "• 使用 Redis 缓存热",
          bbox: { x: 0.1, y: 0.2, width: 0.6, height: 0.02 },
          source: "native" as const,
          confidence: 0.99,
          role: "list-item" as const,
        },
        {
          id: "bullet-middle",
          pageIndex: 0,
          order: 1,
          text: "点数据和会话上下",
          bbox: { x: 0.12, y: 0.23, width: 0.6, height: 0.02 },
          source: "native" as const,
          confidence: 0.99,
          role: "paragraph" as const,
        },
        {
          id: "bullet-end",
          pageIndex: 0,
          order: 2,
          text: "文，提高系统响应速度。",
          bbox: { x: 0.12, y: 0.26, width: 0.6, height: 0.02 },
          source: "native" as const,
          confidence: 0.99,
          role: "paragraph" as const,
        },
      ]
    : [];
  const sourceBlockIds = bulletBlocks.map((block) => block.id);
  return {
    resume: {
      id: "resume-editor",
      revision: 0,
      originalFileName: "resume.pdf",
      mimeType: "application/pdf",
      locale: "zh-CN",
      pageCount: 1,
      parseMethod: "native",
      sourceBlocks: bulletBlocks,
      ast: {
        schemaVersion: "1.0",
        locale: "zh-CN",
        contact: { name: "候选人", links: [] },
        sections: [
          {
            id: "projects",
            type: "projects",
            title: "项目经历",
            sourceBlockIds,
            entries: [
              {
                id: "project-1",
                title: "知识库",
                current: false,
                bullets: withBrokenLines
                  ? [
                      "使用 Redis 缓存热",
                      "点数据和会话上下",
                      "文，提高系统响应速度。",
                    ]
                  : ["负责知识库建设。"],
                keywords: [],
                sourceBlockIds,
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
      resumeId: "resume-editor",
      resumeRevision: 0,
      total: 70,
      summary: "可继续优化。",
      dimensions: [
        "impact",
        "completeness",
        "clarity",
        "structure",
        "ats",
        "language",
      ].map((id) => ({
        id: id as
          | "impact"
          | "completeness"
          | "clarity"
          | "structure"
          | "ats"
          | "language",
        label: id,
        score: 10,
        maxScore: id === "impact" ? 25 : 15,
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

function renderFixture(revision: number): RenderResponse {
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
      resumeId: "resume-editor",
      resumeRevision: revision,
      template: "professional",
      artifactSha256: sha256,
      sourcePageCount: 1,
      pageCount: 1,
      downloadable: true,
      searchableText: true,
      contentComplete: true,
      hardGate,
      overallScore: 100,
      checks: [],
      generatedAt: "2026-07-27T00:00:00.000Z",
    },
  };
}

afterEach(() => {
  cleanup();
  api.renderResume.mockReset();
  vi.restoreAllMocks();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
});

describe("ResumeContentEditor", () => {
  it("repairs old wrapped bullets, saves one revision, and renders exactly once", async () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    api.renderResume.mockResolvedValue(renderFixture(1));
    const user = userEvent.setup();
    render(createElement(ResumeContentEditor));

    await user.click(
      screen.getByRole("button", { name: /直接编辑简历内容/ }),
    );
    expect(screen.getByText(/已在草稿中合并 2 处疑似断行/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "项目经历" }));
    expect(screen.getByRole("textbox", { name: "要点 1" })).toHaveValue(
      "使用 Redis 缓存热点数据和会话上下文，提高系统响应速度。",
    );
    expect(screen.queryByRole("textbox", { name: "要点 2" })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "保存并生成 PDF" }),
    );

    await waitFor(() => expect(api.renderResume).toHaveBeenCalledTimes(1));
    expect(api.renderResume).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1, template: "professional" }),
    );
    await waitFor(() => {
      expect(useAppStore.getState().analysis?.resume.revision).toBe(1);
    });
    expect(
      useAppStore.getState().analysis?.resume.ast.sections[0]?.entries[0]
        ?.bullets,
    ).toEqual([
      "使用 Redis 缓存热点数据和会话上下文，提高系统响应速度。",
    ]);
    expect(useAppStore.getState().undoStack).toHaveLength(1);
  });

  it("keeps the dialog open when the user rejects discarding unsaved edits", async () => {
    useAppStore.getState().setAnalysis(analysisFixture(false));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(createElement(ResumeContentEditor));

    await user.click(
      screen.getByRole("button", { name: /直接编辑简历内容/ }),
    );
    const name = screen.getByRole("textbox", { name: "姓名" });
    await user.clear(name);
    await user.type(name, "新姓名");
    await user.click(
      screen.getByRole("button", { name: "关闭简历编辑器" }),
    );

    expect(confirm).toHaveBeenCalledWith(
      "还有未保存的简历修改，确定放弃吗？",
    );
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
