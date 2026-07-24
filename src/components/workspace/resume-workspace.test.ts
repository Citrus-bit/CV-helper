// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const storeMock = vi.hoisted(() => ({
  resumePanel: "suggestions",
  setResumePanel: vi.fn(),
}));

vi.mock("@/lib/client/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      analysis: { scorecard: {}, resume: { sourceBlocks: [] } },
      jobMatch: null,
      activeResumeVariantId: null,
      setResumeVariant: vi.fn(),
      resumePanel: storeMock.resumePanel,
      setResumePanel: storeMock.setResumePanel,
    }),
}));

vi.mock("./document-preview", () => ({
  DocumentPreview: () => createElement("div", null, "文档预览"),
}));
vi.mock("./score-panel", () => ({
  ScorePanel: () => createElement("div", null, "评分"),
}));
vi.mock("./suggestion-review", () => ({
  SuggestionReview: () => createElement("div", null, "建议内容"),
}));
vi.mock("./template-export", () => ({
  TemplateExport: () => createElement("input", { "aria-label": "导出草稿" }),
}));

import { ResumeWorkspace } from "./resume-workspace";

afterEach(() => {
  cleanup();
  storeMock.resumePanel = "suggestions";
  vi.clearAllMocks();
});

describe("ResumeWorkspace layout", () => {
  it("keeps visited tab state mounted without leaving inactive panels in layout", async () => {
    const user = userEvent.setup();
    storeMock.setResumePanel.mockImplementation((panel: string) => {
      storeMock.resumePanel = panel;
    });
    const view = render(createElement(ResumeWorkspace));
    const workspace = screen.getByRole("heading", { name: "简历优化" })
      .parentElement;

    const suggestionPanel = screen.getByRole("tabpanel", {
      name: "修改建议",
    });
    const exportTab = screen.getByRole("tab", { name: "排版预览" });

    expect(workspace).toHaveClass("absolute", "inset-0", "min-h-0");
    expect(suggestionPanel).toHaveClass("hidden", "data-[state=active]:flex");
    expect(suggestionPanel).not.toHaveAttribute("hidden");
    expect(suggestionPanel).toHaveStyle({ display: "flex" });

    await user.click(exportTab);
    expect(storeMock.setResumePanel).toHaveBeenCalledWith("templates");
    view.rerender(createElement(ResumeWorkspace));

    expect(suggestionPanel).toHaveStyle({ display: "none" });
    const exportPanel = screen.getByRole("tabpanel", { name: "排版预览" });
    expect(exportPanel).toHaveStyle({ display: "flex" });

    const draft = screen.getByRole("textbox", { name: "导出草稿" });
    await user.type(draft, "保留当前状态");
    await user.click(screen.getByRole("tab", { name: "修改建议" }));
    view.rerender(createElement(ResumeWorkspace));

    expect(draft).toHaveValue("保留当前状态");
    expect(exportPanel).toHaveAttribute("data-state", "inactive");
    expect(exportPanel).toHaveClass("hidden", "data-[state=active]:flex");
    expect(exportPanel).toHaveStyle({ display: "none" });
  });
});
