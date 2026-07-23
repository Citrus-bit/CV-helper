// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ analysis: { scorecard: {} } }),
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
  TemplateExport: () => createElement("div", null, "导出内容"),
}));

import { ResumeWorkspace } from "./resume-workspace";

afterEach(cleanup);

describe("ResumeWorkspace layout", () => {
  it("removes inactive tab panels from layout flow", async () => {
    const user = userEvent.setup();
    render(createElement(ResumeWorkspace));

    const suggestionPanel = screen.getByRole("tabpanel", {
      name: "修改建议",
    });
    const exportTab = screen.getByRole("tab", { name: "排版预览" });

    expect(suggestionPanel).toHaveClass(
      "hidden",
      "data-[state=active]:flex",
    );
    expect(suggestionPanel).not.toHaveAttribute("hidden");

    await user.click(exportTab);

    expect(suggestionPanel).toHaveAttribute("hidden");
    expect(
      screen.getByRole("tabpanel", { name: "排版预览" }),
    ).not.toHaveAttribute("hidden");
  });
});
