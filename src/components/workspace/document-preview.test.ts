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
          pageCount: 1,
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
        pagePreviews: ["data:image/png;base64,AA=="],
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

import {
  DocumentPreview,
  selectSuggestionSourceBlock,
  selectSuggestionSourceBlocks,
  sourceBlockHighlightRectangles,
} from "./document-preview";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DocumentPreview parsing notices", () => {
  it("shows parser warnings and lets the user inspect low-confidence OCR pages", async () => {
    const user = userEvent.setup();
    render(createElement(DocumentPreview));

    await user.click(screen.getByText("解析提醒 2"));
    expect(
      screen.getByText("第 1 页原生文字较少，已使用 OCR 补充。"),
    ).toBeInTheDocument();
    await user.click(screen.getByText("第 1 页包含低置信度 OCR 区块"));

    expect(setPreviewMode).toHaveBeenCalledWith("locate");
  });
});

describe("selectSuggestionSourceBlock", () => {
  it("selects the block matching the original sentence instead of the first reference", () => {
    const blocks = [
      SourceBlockSchema.parse({
        id: "role-heading",
        pageIndex: 0,
        order: 0,
        role: "heading",
        text: "高级产品经理",
        source: "native",
        confidence: 1,
        bbox: { x: 0.1, y: 0.1, width: 0.3, height: 0.04 },
      }),
      SourceBlockSchema.parse({
        id: "matching-bullet",
        pageIndex: 0,
        order: 1,
        role: "list-item",
        text: "负责 AI 产品从 0 到 1，并推动三个行业版本上线。",
        source: "native",
        confidence: 1,
        bbox: { x: 0.1, y: 0.2, width: 0.7, height: 0.06 },
      }),
    ];

    expect(
      selectSuggestionSourceBlock(
        {
          sourceBlockIds: ["role-heading", "matching-bullet"],
          originalText: "负责 AI 产品从 0 到 1，并推动三个行业版本上线。",
        },
        blocks,
      )?.id,
    ).toBe("matching-bullet");
  });

  it("keeps every referenced line that contributes to a wrapped sentence", () => {
    const blocks = [
      SourceBlockSchema.parse({
        id: "label",
        pageIndex: 0,
        order: 0,
        role: "heading",
        text: "项目描述",
        source: "native",
        confidence: 1,
        bbox: { x: 0.02, y: 0.2, width: 0.08, height: 0.03 },
      }),
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

    const selected = selectSuggestionSourceBlocks(
      {
        sourceBlockIds: blocks.map((block) => block.id),
        originalText:
          "为大众点评的本地生活服务平台，涵盖用户认证、商户查询、优惠券秒杀等业务，并对高并发场景进行深度优化。",
      },
      blocks,
    );

    expect(selected.map((block) => block.id)).toEqual([
      "line-one",
      "line-two",
    ]);
    expect(sourceBlockHighlightRectangles(selected)).toHaveLength(2);
  });
});
