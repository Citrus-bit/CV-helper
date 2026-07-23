// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalysisBundle } from "@/lib/client/contracts";
import { useAppStore } from "@/lib/client/store";
import { UploadScreen } from "./upload-screen";

const originalRefreshRecentSessions =
  useAppStore.getState().refreshRecentSessions;

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
      id: "unarchived-resume",
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
      resumeId: "unarchived-resume",
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
    pagePreviews: [],
    processing: {
      extractionMode: "native",
      durationMs: 1,
      capabilityVersions: {},
    },
  };
}

afterEach(() => {
  cleanup();
  useAppStore.setState({
    refreshRecentSessions: originalRefreshRecentSessions,
  });
  useAppStore.getState().reset();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("UploadScreen current session recovery", () => {
  it("continues an in-memory analysis when no recent record exists", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.setState({
      stage: "upload",
      recentAnalyses: [],
      recentAnalysesLoading: false,
    });

    render(createElement(UploadScreen));

    expect(screen.getByText("当前分析仍可继续")).toBeInTheDocument();
    expect(screen.getByText(/candidate\.pdf/)).toHaveTextContent(
      "尚未写入最近记录",
    );
    fireEvent.click(screen.getByRole("button", { name: "继续当前分析" }));
    expect(useAppStore.getState().stage).toBe("workspace");
  });
});
