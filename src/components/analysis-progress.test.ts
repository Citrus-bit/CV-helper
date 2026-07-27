// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  beginAnalysisRequest,
  hasActiveAnalysisRequest,
} from "@/lib/client/analysis-request";
import { useAppStore } from "@/lib/client/store";
import { AnalysisProgress } from "./analysis-progress";

afterEach(() => {
  cleanup();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
});

describe("AnalysisProgress", () => {
  it("shows an explicitly estimated progress state without simulated step completion", () => {
    render(createElement(AnalysisProgress));

    expect(
      screen.getByRole("region", { name: "正在分析简历" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "分析完成后会自动进入结果页",
    );
    expect(
      screen.getByRole("heading", { name: "分析内容" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PDF 文字与版面")).toBeInTheDocument();
    expect(screen.getByText("仅在文字缺失时启用 OCR")).toBeInTheDocument();
    expect(screen.getByText("完整结果生成后统一展示")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "简历分析预估进度" }),
    ).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("预估进度")).toBeInTheDocument();
    expect(screen.queryByText("校验 PDF")).not.toBeInTheDocument();
    expect(screen.queryByText("生成评分与建议")).not.toBeInTheDocument();
  });

  it("cancels the active request and returns to the upload screen", () => {
    beginAnalysisRequest();
    useAppStore.setState({ stage: "analyzing" });

    render(createElement(AnalysisProgress));
    expect(hasActiveAnalysisRequest()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "取消分析" }));

    expect(hasActiveAnalysisRequest()).toBe(false);
    expect(useAppStore.getState().stage).toBe("upload");
  });
});
