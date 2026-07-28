// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalysisBundle } from "@/lib/client/contracts";
import { useAppStore } from "@/lib/client/store";

vi.mock("./resume-workspace", () => ({
  ResumeWorkspace: () => createElement("div", null, "简历工作区"),
}));
vi.mock("./job-workspace", () => ({
  JobWorkspace: () => createElement("div", null, "岗位工作区"),
}));
vi.mock("./interview-workspace", () => ({
  InterviewWorkspace: () => createElement("div", null, "面试工作区"),
}));

import { Workspace } from "./workspace";

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
      id: "workspace-resume",
      revision: 0,
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
    evidence: [],
    claims: [],
    scorecard: {
      resumeId: "workspace-resume",
      resumeRevision: 0,
      total: 72,
      summary: "测试摘要",
      dimensions: dimensions.map((id) => ({
        id,
        label: id,
        score: 12,
        maxScore: id === "impact" || id === "language" ? 20 : 15,
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

function analysisWithPendingSuggestion(): AnalysisBundle {
  const analysis = analysisFixture();
  return {
    ...analysis,
    suggestions: [
      {
        id: "suggestion-pending",
        resumeRevision: 0,
        sourceBlockIds: [],
        claimIds: [],
        kind: "rewrite",
        status: "pending",
        originalText: "负责项目交付",
        proposedText: "负责项目按期交付",
        rationale: "补全表达",
        beforeHash: "before-hash",
        patches: [],
        affectedDimensions: ["clarity"],
        scoreGain: 20,
        factRisk: "none",
        interviewRisk: "none",
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("Workspace archive failure recovery", () => {
  it("keeps workspace scrolling inside a viewport-locked shell", () => {
    useAppStore.getState().setAnalysis(analysisFixture());

    render(createElement(Tooltip.Provider, null, createElement(Workspace)));

    expect(screen.getByRole("main")).toHaveClass("h-dvh", "overflow-hidden");
    expect(document.getElementById("workspace-content")).toHaveClass(
      "relative",
      "h-0",
      "min-h-0",
      "flex-1",
      "overflow-hidden",
    );
  });

  it("announces the save failure and returns home without deleting analysis", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.setState({
      error: "无法安全保存当前会话：本机记录存储不可用。",
    });

    render(createElement(Tooltip.Provider, null, createElement(Workspace)));

    expect(screen.getByRole("alert")).toHaveTextContent("无法保存到最近记录");
    expect(
      screen.getByRole("button", { name: "重试保存" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "不归档，返回首页" }));

    expect(useAppStore.getState()).toMatchObject({
      stage: "upload",
      analysis: { resume: { id: "workspace-resume" } },
      error: null,
    });
  });
});

describe("Workspace progression gate", () => {
  it("keeps later modules locked until every suggestion has a decision", () => {
    useAppStore.getState().setAnalysis(analysisWithPendingSuggestion());
    useAppStore.getState().setModule("interview");
    expect(useAppStore.getState().module).toBe("resume");

    render(createElement(Tooltip.Provider, null, createElement(Workspace)));

    const jobButton = screen.getByRole("button", { name: "岗位匹配" });
    const interviewButton = screen.getByRole("button", { name: "模拟面试" });
    expect(jobButton).toBeDisabled();
    expect(interviewButton).toBeDisabled();
    expect(screen.getByText(/还有 1 条建议待确认/)).toBeInTheDocument();

    act(() => {
      useAppStore.getState().decideSuggestion("suggestion-pending", "rejected");
    });

    expect(jobButton).toBeEnabled();
    fireEvent.click(jobButton);
    expect(useAppStore.getState().module).toBe("job");
  });
});
