// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceBlockSchema } from "@/lib/domain";

const setPreviewMode = vi.fn();

vi.mock("@/lib/client/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      analysis: {
        resume: {
          originalFileName: "scan.pdf",
          pageCount: 2,
          parsingWarnings: ["第 1 页原生文字较少，已使用 OCR 补充。"],
          sourceBlocks: [
            {
              id: "ocr-risk",
              pageIndex: 0,
              source: "ocr",
              confidence: 0.62,
              bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.08 },
            },
          ],
        },
        suggestions: [],
        originalPdfBase64: "JVBERi0=",
      },
      selectedSuggestionId: null,
      selectedTemplate: "professional",
      renders: {},
      previewMode: "original",
      setPreviewMode,
      markRenderPreviewed: vi.fn(),
      attachOriginalPdf: vi.fn(),
  }),
}));

vi.mock("./original-pdf-page", () => ({
  OriginalPdfPage: ({ pageIndex }: { pageIndex: number }) =>
    `原版 PDF 第 ${pageIndex + 1} 页`,
}));

import {
  DocumentPreview,
  sourceBlockHighlightRectangles,
} from "./document-preview";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DocumentPreview parsing notices", () => {
  it("keeps three preview modes and opens low-confidence OCR pages in the original PDF", async () => {
    const user = userEvent.setup();
    render(createElement(DocumentPreview));

    expect(screen.getByRole("button", { name: "原版 PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新版 PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "并排对照" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "原文定位" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("解析提醒 2"));
    expect(
      screen.getByText("第 1 页原生文字较少，已使用 OCR 补充。"),
    ).toBeInTheDocument();
    await user.click(screen.getByText("第 1 页包含低置信度 OCR 区块"));

    expect(setPreviewMode).toHaveBeenCalledWith("original");
  });

  it("navigates original PDF pages in the merged preview", async () => {
    const user = userEvent.setup();
    render(createElement(DocumentPreview));

    expect(screen.getByText("原版 PDF 第 1 页")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("原版 PDF 第 2 页")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });
});

describe("sourceBlockHighlightRectangles", () => {
  it("keeps every referenced line that contributes to a wrapped sentence", () => {
    const blocks = [
      SourceBlockSchema.parse({
        id: "line-one",
        pageIndex: 0,
        order: 1,
        role: "paragraph",
        text: "为大众点评的本地生活服务平台，涵盖用户认证、商户查询、",
        source: "native",
        confidence: 1,
        bbox: { x: 0.12, y: 0.2, width: 0.82, height: 0.03 },
      }),
      SourceBlockSchema.parse({
        id: "line-two",
        pageIndex: 0,
        order: 2,
        role: "paragraph",
        text: "优惠券秒杀等业务，并对高并发场景进行深度优化。",
        source: "native",
        confidence: 1,
        bbox: { x: 0.02, y: 0.24, width: 0.7, height: 0.03 },
      }),
    ];

    expect(sourceBlockHighlightRectangles(blocks)).toHaveLength(2);
  });
});
