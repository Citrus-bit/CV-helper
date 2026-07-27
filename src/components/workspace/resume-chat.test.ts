// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AnalysisBundle } from "@/lib/client/contracts";
import { useAppStore } from "@/lib/client/store";

const mocks = vi.hoisted(() => ({
  sendResumeChatMessage: vi.fn(),
}));

vi.mock("@/lib/client/api", () => ({
  sendResumeChatMessage: mocks.sendResumeChatMessage,
}));

import { ResumeChat } from "./resume-chat";

function analysisFixture(): AnalysisBundle {
  return {
    resume: {
      id: "resume-chat-component",
      revision: 0,
      originalFileName: "resume.pdf",
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
    evidence: [],
    claims: [],
    scorecard: {
      resumeId: "resume-chat-component",
      resumeRevision: 0,
      total: 70,
      summary: "可继续优化。",
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
    suggestions: [],
    stories: [],
    processing: {
      extractionMode: "native",
      durationMs: 1,
      capabilityVersions: {},
    },
  };
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  mocks.sendResumeChatMessage.mockReset();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
});

describe("ResumeChat", () => {
  it("shows progress, then persists the real AI reply in local context", async () => {
    let resolveTurn!: (value: {
      reply: string;
      summary: string;
      confirmedFacts: string[];
      suggestions: [];
      sourceVersion: string;
      durationMs: number;
    }) => void;
    mocks.sendResumeChatMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveTurn = resolve;
      }),
    );
    useAppStore.getState().setAnalysis(analysisFixture());
    const user = userEvent.setup();
    render(createElement(ResumeChat));

    await user.type(
      screen.getByRole("textbox", { name: "继续修改" }),
      "先分析我的项目经历",
    );
    await user.click(screen.getByRole("button", { name: "发送给 AI 编辑" }));

    expect(screen.getByText("先分析我的项目经历")).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "AI 编辑预估进度" }),
    ).toHaveAttribute("aria-valuemax", "100");

    await act(async () => {
      resolveTurn({
        reply: "项目经历的主要问题是动作与结果之间缺少连接。",
        summary: "正在分析项目经历的表达。",
        confirmedFacts: [],
        suggestions: [],
        sourceVersion: "resume.chat@2.0.0",
        durationMs: 2_000,
      });
    });

    expect(
      await screen.findByText(
        "项目经历的主要问题是动作与结果之间缺少连接。",
      ),
    ).toBeVisible();
    await waitFor(() => {
      expect(useAppStore.getState().resumeChat?.summary).toBe(
        "正在分析项目经历的表达。",
      );
    });
    expect(useAppStore.getState().resumeChat?.messages).toHaveLength(2);
  });
});
