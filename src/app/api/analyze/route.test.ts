import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedPdfResult } from "@/lib/server/pdf";

const state = vi.hoisted(() => ({ parsed: undefined as unknown }));
const mocks = vi.hoisted(() => ({
  invokeBaselineCapability: vi.fn(async (id: string, input: unknown) => {
    if (id === "document.parse") {
      return {
        data: {
          fileName: "mixed.pdf",
          pageCount: 3,
          text: "Senior Product Manager",
          blocks: [
            {
              id: "native-title",
              pageIndex: 1,
              order: 0,
              text: "Senior Product Manager",
              source: "native",
              confidence: 1,
              bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.06 },
              role: "heading",
              style: {
                fontFamily: "ABCDEE+Helvetica-Bold",
                fontSize: 18,
                fontWeight: 700,
                fontStyle: "normal",
              },
            },
          ],
          pages: [
            { pageIndex: 0, width: 600, height: 800, previewWidth: 1120, previewHeight: 1494, source: "scan", nativeCharacterCount: 0, previewMimeType: "image/png", previewBase64: "c2Nhbg==" },
            { pageIndex: 1, width: 600, height: 800, previewWidth: 1120, previewHeight: 1494, source: "mixed", nativeCharacterCount: 21, previewMimeType: "image/png", previewBase64: "bWl4ZWQ=" },
            { pageIndex: 2, width: 600, height: 800, source: "digital", nativeCharacterCount: 250, previewMimeType: "image/png", previewBase64: "ZGlnaXRhbA==" },
          ],
          warnings: [],
          extractionMode: "mixed",
        },
        sourceVersion: "document.parse@1.0.0",
        warnings: [],
      };
    }
    if (id === "document.ocr") {
      const pageIndex = (input as { pageIndex: number }).pageIndex;
      const blocks = pageIndex === 0
        ? [
            {
              id: "scan-body",
              pageIndex,
              order: 0,
              text: "Scanned work experience",
              source: "ocr",
              confidence: 0.82,
              bbox: { x: 0.1, y: 0.2, width: 0.8, height: 0.1 },
              role: "paragraph",
            },
          ]
        : [
            {
              id: "mixed-duplicate",
              pageIndex,
              order: 0,
              text: "Senior Product Manager",
              source: "ocr",
              confidence: 0.9,
              bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.06 },
              role: "paragraph",
            },
            {
              id: "mixed-missing",
              pageIndex,
              order: 1,
              text: "Improved activation from 42% to 61%",
              source: "ocr",
              confidence: 0.93,
              bbox: { x: 0.1, y: 0.55, width: 0.72, height: 0.075 },
              role: "paragraph",
            },
          ];
      return {
        data: { text: blocks.map((block) => block.text).join("\n"), confidence: 0.9, blocks, engine: "tesseract.js" },
        sourceVersion: "document.ocr@1.0.0",
        warnings: [],
      };
    }
    if (id === "document.segment") {
      return {
        data: { blocks: (input as { blocks: unknown[] }).blocks, segments: [] },
        sourceVersion: "document.segment@1.0.0",
        warnings: [],
      };
    }
    throw new Error(`Unexpected capability: ${id}`);
  }),
  createCapabilityContext: vi.fn((locale: string, grantedDataScopes: readonly string[], signal?: AbortSignal, deadlineMs = 30_000) => ({
    locale,
    grantedDataScopes,
    deadlineMs,
    signal,
  })),
  analyzeParsedResume: vi.fn(async (parsed: unknown) => {
    state.parsed = parsed;
    return { processing: { durationMs: 0 } };
  }),
}));

vi.mock("@/lib/baseline", () => ({
  invokeBaselineCapability: mocks.invokeBaselineCapability,
}));

vi.mock("@/lib/server/analysis", () => ({
  analyzeParsedResume: mocks.analyzeParsedResume,
  createCapabilityContext: mocks.createCapabilityContext,
}));

import { POST } from "./route";

describe("POST /api/analyze mixed-page OCR", () => {
  beforeEach(() => {
    state.parsed = undefined;
    mocks.invokeBaselineCapability.mockClear();
    mocks.createCapabilityContext.mockClear();
    mocks.analyzeParsedResume.mockClear();
  });

  it("OCRs scan and mixed pages while adding only uncovered mixed-page blocks", async () => {
    const form = new FormData();
    form.set("file", new File(["%PDF-mocked"], "mixed.pdf", { type: "application/pdf" }));

    const response = await POST(new Request("http://localhost/api/analyze", { method: "POST", body: form }));

    expect(response.status, await response.clone().text()).toBe(200);
    const ocrCalls = mocks.invokeBaselineCapability.mock.calls.filter(([id]) => id === "document.ocr");
    expect(ocrCalls.map(([, input]) => (input as { pageIndex: number }).pageIndex)).toEqual([0, 1]);
    expect(ocrCalls.map(([, input]) => ({ width: (input as { width: number }).width, height: (input as { height: number }).height }))).toEqual([
      { width: 1120, height: 1494 },
      { width: 1120, height: 1494 },
    ]);
    expect(mocks.createCapabilityContext).toHaveBeenCalledWith("mixed", ["page_image"], expect.any(AbortSignal), 180_000);

    const parsed = state.parsed as ParsedPdfResult;
    expect(parsed.blocks.map((block) => block.id)).toEqual(["native-title", "scan-body", "mixed-missing"]);
    expect(parsed.blocks.find((block) => block.id === "mixed-missing")).toMatchObject({
      confidence: 0.93,
      bbox: { x: 0.1, y: 0.55, width: 0.72, height: 0.075 },
    });
    expect(parsed.blocks.find((block) => block.id === "native-title")).toMatchObject({
      role: "heading",
      style: {
        fontFamily: "ABCDEE+Helvetica-Bold",
        fontSize: 18,
        fontWeight: 700,
        fontStyle: "normal",
      },
    });
    expect(parsed.pages.map((page) => page.ocrConfidence)).toEqual([0.9, 0.9, undefined]);
    expect(parsed.extractionMode).toBe("hybrid");
  });
});
