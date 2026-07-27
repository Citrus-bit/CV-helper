// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Tooltip from "@radix-ui/react-tooltip";

import type { AnalysisBundle } from "@/lib/client/contracts";
import { useAppStore } from "@/lib/client/store";
import { retainUploadFile } from "@/lib/client/retained-upload";
import { UploadScreen } from "./upload-screen";

const apiMocks = vi.hoisted(() => ({
  aiAnalysisAvailable: vi.fn(async () => true),
  analyzeResume: vi.fn(),
  loadDemoAnalysis: vi.fn(),
}));

vi.mock("@/lib/client/api", () => apiMocks);

const originalRefreshRecentSessions =
  useAppStore.getState().refreshRecentSessions;

function windowDragEvent(
  type: "dragleave" | "dragover" | "drop",
  types: string[],
  point?: { clientX: number; clientY: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types, files: { item: () => null }, dropEffect: "none" },
  });
  if (point) {
    Object.defineProperties(event, {
      clientX: { value: point.clientX },
      clientY: { value: point.clientY },
    });
  }
  return event;
}

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
  useAppStore.setState({
    refreshRecentSessions: originalRefreshRecentSessions,
  });
  useAppStore.getState().reset();
  useAppStore.setState({ recentAnalyses: [] });
  retainUploadFile(null);
  window.sessionStorage.clear();
  apiMocks.analyzeResume.mockReset();
  apiMocks.loadDemoAnalysis.mockReset();
  apiMocks.aiAnalysisAvailable.mockReset();
  apiMocks.aiAnalysisAvailable.mockResolvedValue(true);
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

    render(
      createElement(
        Tooltip.Provider,
        null,
        createElement(UploadScreen),
      ),
    );

    expect(screen.getByText("当前分析仍可继续")).toBeInTheDocument();
    expect(screen.getByText(/candidate\.pdf/)).toHaveTextContent(
      "尚未写入最近记录",
    );
    fireEvent.click(screen.getByRole("button", { name: "继续当前分析" }));
    expect(useAppStore.getState().stage).toBe("workspace");
  });

  it("isolates a legacy local analysis instead of reopening the workspace", () => {
    const legacy = analysisFixture();
    legacy.processing.capabilityVersions["resume.score"] =
      "resume.score@1.0.0";
    legacy.processing.capabilityVersions["resume.suggest"] =
      "resume.suggest@1.0.0";
    legacy.processing.aiAnalysis = undefined;
    useAppStore.setState({
      analysis: legacy,
      stage: "upload",
      recentAnalyses: [],
      recentAnalysesLoading: false,
      refreshRecentSessions: vi.fn(async () => undefined),
    });

    render(createElement(UploadScreen));

    expect(screen.getByText("旧版本地分析")).toBeInTheDocument();
    expect(
      screen.getByText(/旧规则结果不会进入工作台/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "继续当前分析" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新上传 PDF" }),
    ).toBeInTheDocument();
  });

  it("marks legacy recent records without presenting their local score as AI", async () => {
    useAppStore.setState({
      recentAnalyses: [
        {
          id: "legacy-record",
          createdAt: "2026-07-27T00:00:00.000Z",
          updatedAt: "2026-07-27T00:01:00.000Z",
          expiresAt: "2026-07-28T00:00:00.000Z",
          originalFileName: "legacy.pdf",
          pageCount: 1,
          parseMethod: "native",
          resumeRevision: 0,
          score: 88,
          summary: "旧规则摘要",
          summarySource: "rules",
          pendingSuggestionCount: 3,
          hasPdf: false,
          isFreshAiAnalysis: false,
        },
      ],
      recentAnalysesLoading: false,
      refreshRecentSessions: vi.fn(async () => undefined),
    });

    render(
      createElement(
        Tooltip.Provider,
        null,
        createElement(UploadScreen),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "重新上传 PDF" }),
      ).toBeEnabled(),
    );

    expect(screen.getByText("旧版本地分析")).toBeInTheDocument();
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    expect(screen.getByText(/旧分数不作为/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "继续分析" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a newer failed revision recoverable beside an older AI archive", () => {
    const current = analysisFixture();
    current.resume.revision = 1;
    current.processing.aiAnalysis!.status = "failed";
    useAppStore.setState({
      analysis: current,
      stage: "upload",
      recentAnalyses: [
        {
          id: current.resume.id,
          createdAt: "2026-07-27T00:00:00.000Z",
          updatedAt: "2026-07-27T00:01:00.000Z",
          expiresAt: "2026-07-28T00:00:00.000Z",
          originalFileName: current.resume.originalFileName,
          pageCount: 1,
          parseMethod: "native",
          resumeRevision: 0,
          score: 72,
          summary: "旧 revision 的完整 AI 快照",
          summarySource: "ai",
          pendingSuggestionCount: 0,
          hasPdf: true,
          isFreshAiAnalysis: true,
        },
      ],
      recentAnalysesLoading: false,
      refreshRecentSessions: vi.fn(async () => undefined),
    });

    render(
      createElement(
        Tooltip.Provider,
        null,
        createElement(UploadScreen),
      ),
    );

    expect(screen.getByText("当前分析仍可继续")).toBeInTheDocument();
    expect(screen.getByText(/当前版本尚未完成 AI 分析/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "继续并重试 AI" }),
    ).toBeInTheDocument();
  });
});

describe("UploadScreen file drag state", () => {
  it("keeps the drag hit target mounted while the active state renders", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    const dataTransfer = {
      types: ["Files"],
      files: { item: () => null },
      dropEffect: "none",
    };

    render(createElement(UploadScreen));
    const dropZone = screen.getByRole("region", {
      name: "PDF 简历上传区",
    });
    vi.spyOn(dropZone, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 200,
      left: 100,
      top: 200,
      right: 900,
      bottom: 600,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    });
    const childHeading = screen.getByRole("heading", {
      name: "拖入你的 PDF 简历",
    });
    const uploadIcon = dropZone.querySelector("svg");

    fireEvent.dragEnter(childHeading, {
      dataTransfer,
      clientX: 420,
      clientY: 360,
    });
    expect(screen.getByText("松开即可开始分析")).toBeInTheDocument();
    expect(dropZone).toHaveAttribute("data-drag-active", "true");
    expect(dropZone.querySelector("svg")).toBe(uploadIcon);

    const activeHeading = screen.getByRole("heading", {
      name: "松开即可开始分析",
    });
    // WebKit can report 0,0 and no relatedTarget while an external file drag
    // merely crosses a child node. The event target is still inside the zone.
    act(() => {
      activeHeading.dispatchEvent(
        windowDragEvent("dragleave", ["Files"], {
          clientX: 0,
          clientY: 0,
        }),
      );
    });
    expect(screen.getByText("松开即可开始分析")).toBeInTheDocument();

    fireEvent.dragOver(screen.getByRole("button", { name: "选择 PDF" }), {
      dataTransfer,
    });
    expect(screen.getByText("松开即可开始分析")).toBeInTheDocument();
    expect(dataTransfer.dropEffect).toBe("copy");
  });

  it("tracks the actual drop-zone boundary across repeated child crossings", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    const dataTransfer = {
      types: ["Files"],
      files: { item: () => null },
      dropEffect: "none",
    };

    render(createElement(UploadScreen));
    const dropZone = screen.getByRole("region", {
      name: "PDF 简历上传区",
    });
    const childHeading = screen.getByRole("heading", {
      name: "拖入你的 PDF 简历",
    });
    const selectButton = screen.getByRole("button", { name: "选择 PDF" });
    const outsideHeading = screen.getByRole("heading", {
      name: "从真实简历开始",
    });

    fireEvent.dragOver(childHeading, { dataTransfer });
    fireEvent.dragLeave(childHeading, { dataTransfer });
    fireEvent.dragOver(selectButton, { dataTransfer });
    expect(screen.getByText("松开即可开始分析")).toBeInTheDocument();

    fireEvent.dragOver(outsideHeading, { dataTransfer });
    expect(screen.getByText("拖入你的 PDF 简历")).toBeInTheDocument();
    expect(dropZone).toHaveAttribute("data-drag-active", "false");
    expect(dataTransfer.dropEffect).toBe("none");
  });

  it("keeps the active state when dragover follows any transient child leave", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    const dataTransfer = {
      types: ["Files"],
      files: { item: () => null },
      dropEffect: "none",
    };

    render(createElement(UploadScreen));
    const dropZone = screen.getByRole("region", {
      name: "PDF 简历上传区",
    });
    fireEvent.dragEnter(dropZone, { dataTransfer });
    fireEvent.dragLeave(dropZone, { dataTransfer });
    fireEvent.dragOver(dropZone, { dataTransfer });

    expect(screen.getByText("松开即可开始分析")).toBeInTheDocument();
    expect(dataTransfer.dropEffect).toBe("copy");
  });

  it("uses the drop-zone bounds when a native drag temporarily targets the window", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    render(createElement(UploadScreen));
    const dropZone = screen.getByRole("region", {
      name: "PDF 简历上传区",
    });
    vi.spyOn(dropZone, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 200,
      left: 100,
      top: 200,
      right: 900,
      bottom: 600,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    });

    fireEvent.dragEnter(dropZone, {
      dataTransfer: {
        types: ["Files"],
        files: { item: () => null },
        dropEffect: "none",
      },
    });
    act(() => {
      window.dispatchEvent(
        windowDragEvent("dragover", ["Files"], {
          clientX: 420,
          clientY: 360,
        }),
      );
    });

    expect(screen.getByText("松开即可开始分析")).toBeInTheDocument();
    expect(dropZone).toHaveAttribute("data-drag-active", "true");

    act(() => {
      window.dispatchEvent(
        windowDragEvent("dragover", ["Files"], {
          clientX: 40,
          clientY: 40,
        }),
      );
    });
    expect(screen.getByText("拖入你的 PDF 简历")).toBeInTheDocument();
  });

  it("ignores non-file drag payloads", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    render(createElement(UploadScreen));

    fireEvent.dragEnter(
      screen.getByRole("region", { name: "PDF 简历上传区" }),
      {
        dataTransfer: {
          types: ["text/plain"],
          files: { item: () => null },
          dropEffect: "none",
        },
      },
    );

    expect(screen.getByText("拖入你的 PDF 简历")).toBeInTheDocument();
  });

  it("clears a file drag when the browser cancels it without a final zone leave", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    const dataTransfer = {
      types: ["Files"],
      files: { item: () => null },
      dropEffect: "none",
    };
    render(createElement(UploadScreen));

    fireEvent.dragEnter(
      screen.getByRole("region", { name: "PDF 简历上传区" }),
      { dataTransfer },
    );
    expect(screen.getByText("松开即可开始分析")).toBeInTheDocument();

    fireEvent.dragEnd(window, { dataTransfer });

    expect(screen.getByText("拖入你的 PDF 简历")).toBeInTheDocument();
  });

  it("clears a file drag after leaving the browser or pressing Escape", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    const dataTransfer = {
      types: ["Files"],
      files: { item: () => null },
      dropEffect: "none",
    };
    render(createElement(UploadScreen));
    const dropZone = screen.getByRole("region", {
      name: "PDF 简历上传区",
    });

    fireEvent.dragEnter(dropZone, { dataTransfer });
    act(() => {
      window.dispatchEvent(
        windowDragEvent("dragleave", ["Files"], {
          clientX: -1,
          clientY: -1,
        }),
      );
    });
    expect(screen.getByText("拖入你的 PDF 简历")).toBeInTheDocument();

    fireEvent.dragEnter(dropZone, { dataTransfer });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("拖入你的 PDF 简历")).toBeInTheDocument();
  });

  it("clears a file drag on window blur and on a drop outside the zone", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    const dataTransfer = {
      types: ["Files"],
      files: { item: () => null },
      dropEffect: "none",
    };
    render(createElement(UploadScreen));
    const dropZone = screen.getByRole("region", {
      name: "PDF 简历上传区",
    });

    fireEvent.dragEnter(dropZone, { dataTransfer });
    fireEvent.blur(window);
    expect(screen.getByText("拖入你的 PDF 简历")).toBeInTheDocument();

    fireEvent.dragEnter(dropZone, { dataTransfer });
    act(() => {
      window.dispatchEvent(windowDragEvent("drop", ["Files"]));
    });
    expect(screen.getByText("拖入你的 PDF 简历")).toBeInTheDocument();
  });

  it("submits the first PDF once and clears the active state", async () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    apiMocks.analyzeResume.mockResolvedValue(analysisFixture());
    const file = new File(["%PDF-1.7"], "resume.pdf", {
      type: "application/pdf",
    });
    const dataTransfer = {
      types: ["Files"],
      files: { item: (index: number) => (index === 0 ? file : null) },
      dropEffect: "none",
    };
    render(createElement(UploadScreen));
    const dropZone = screen.getByRole("region", {
      name: "PDF 简历上传区",
    });
    await waitFor(() =>
      expect(dropZone).toHaveAttribute("data-ai-available", "true"),
    );

    fireEvent.dragEnter(dropZone, { dataTransfer });
    fireEvent.drop(dropZone, { dataTransfer });

    expect(screen.getByText("拖入你的 PDF 简历")).toBeInTheDocument();
    await waitFor(() =>
      expect(apiMocks.analyzeResume).toHaveBeenCalledTimes(1),
    );
    expect(apiMocks.analyzeResume.mock.calls[0]?.[0]).toBe(file);
    await waitFor(() => expect(useAppStore.getState().stage).toBe("workspace"));
  });

  it("prevents browser navigation for files dropped outside without blocking text drags", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    render(createElement(UploadScreen));

    const fileDragOver = windowDragEvent("dragover", ["Files"]);
    const fileDrop = windowDragEvent("drop", ["Files"]);
    const textDragOver = windowDragEvent("dragover", ["text/plain"]);
    const textDrop = windowDragEvent("drop", ["text/plain"]);

    window.dispatchEvent(fileDragOver);
    window.dispatchEvent(fileDrop);
    window.dispatchEvent(textDragOver);
    window.dispatchEvent(textDrop);

    expect(fileDragOver).toHaveProperty("defaultPrevented", true);
    expect(fileDrop).toHaveProperty("defaultPrevented", true);
    expect(textDragOver).toHaveProperty("defaultPrevented", false);
    expect(textDrop).toHaveProperty("defaultPrevented", false);
  });

  it("removes every window drag listener on unmount", () => {
    useAppStore.setState({
      refreshRecentSessions: vi.fn(async () => undefined),
    });
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(createElement(UploadScreen));
    const eventTypes = [
      "dragend",
      "dragleave",
      "dragover",
      "drop",
      "blur",
      "keydown",
    ];
    const registered = addListener.mock.calls.filter(([type]) =>
      eventTypes.includes(type),
    );

    unmount();

    expect(registered).toHaveLength(eventTypes.length);
    for (const [type, listener] of registered) {
      expect(removeListener).toHaveBeenCalledWith(type, listener);
    }
  });
});

describe("UploadScreen recent history loading", () => {
  it("shows a loading state on the first frame instead of flashing an empty state", async () => {
    let finishRefresh: (() => void) | undefined;
    useAppStore.setState({
      recentAnalyses: [],
      recentAnalysesLoading: false,
      refreshRecentSessions: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishRefresh = resolve;
          }),
      ),
    });

    render(createElement(UploadScreen));

    expect(screen.getByText("正在读取本机记录")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "本机记录读取预估进度" }),
    ).toHaveAttribute("aria-valuenow", "1");
    expect(screen.queryByText("暂无最近分析")).not.toBeInTheDocument();

    await act(async () => finishRefresh?.());

    await waitFor(() =>
      expect(screen.getByText("暂无最近分析")).toBeInTheDocument(),
    );
  });
});
