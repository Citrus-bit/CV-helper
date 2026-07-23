import { afterEach, describe, expect, it, vi } from "vitest";

import { mapWorkerParseResponse, parseWithDocumentWorker } from "./document-worker";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("document worker response mapping", () => {
  it("normalizes native and OCR point coordinates and preserves raster dimensions", () => {
    const result = mapWorkerParseResponse({
      filename: "candidate.pdf",
      sha256: "a".repeat(64),
      page_count: 1,
      pages: [
        {
          page_number: 1,
          width: 600,
          height: 800,
          preview_width: 1200,
          preview_height: 1600,
          kind: "mixed",
          metrics: { native_character_count: 40 },
          blocks: [
            {
              text: "原生标题",
              bbox: { x0: 60, top: 80, x1: 360, bottom: 120 },
              source: "native",
              confidence: 1,
            },
            {
              text: "OCR 补充",
              bbox: { x0: 60, top: 400, x1: 540, bottom: 480 },
              source: "ocr",
              confidence: 0.9,
            },
          ],
          preview_png_base64: Buffer.from("preview").toString("base64"),
        },
      ],
      warnings: [],
    });

    expect(result.extractionMode).toBe("mixed");
    expect(result.pages[0]).toMatchObject({
      width: 600,
      height: 800,
      previewWidth: 1200,
      previewHeight: 1600,
    });
    expect(result.blocks[1].bbox).toEqual({ x: 0.1, y: 0.5, width: 0.8, height: 0.1 });
  });

  it("rejects a worker response whose digest does not match the uploaded PDF", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic fixture");
    vi.stubEnv("DOCUMENT_WORKER_URL", "http://worker.internal");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      filename: "candidate.pdf",
      sha256: "a".repeat(64),
      page_count: 1,
      pages: [{
        page_number: 1,
        width: 600,
        height: 800,
        preview_width: 1200,
        preview_height: 1600,
        kind: "digital",
        metrics: { native_character_count: 8 },
        blocks: [{
          text: "Candidate",
          bbox: { x0: 60, top: 80, x1: 240, bottom: 110 },
          source: "native",
          confidence: 1,
        }],
        preview_png_base64: Buffer.from("preview").toString("base64"),
      }],
      warnings: [],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(parseWithDocumentWorker({ bytes, fileName: "candidate.pdf" })).rejects.toMatchObject({
      code: "WORKER_DIGEST_MISMATCH",
      status: 502,
    });
  });
});
