import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canFallbackFromDocumentWorker,
  DocumentWorkerError,
  mapWorkerParseResponse,
  parseWithDocumentWorker,
} from "./document-worker";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("document worker response mapping", () => {
  it("falls back only for recoverable worker failures", () => {
    expect(
      canFallbackFromDocumentWorker(
        new DocumentWorkerError(
          "temporarily unavailable",
          "WORKER_UNAVAILABLE",
          503,
        ),
      ),
    ).toBe(true);
    expect(
      canFallbackFromDocumentWorker(
        new DocumentWorkerError(
          "invalid response",
          "WORKER_INVALID_RESPONSE",
          502,
        ),
      ),
    ).toBe(true);
    expect(
      canFallbackFromDocumentWorker(
        new DocumentWorkerError(
          "digest mismatch",
          "WORKER_DIGEST_MISMATCH",
          502,
        ),
      ),
    ).toBe(false);
    expect(
      canFallbackFromDocumentWorker(
        new DocumentWorkerError("payload too large", "PDF_TOO_LARGE", 413),
      ),
    ).toBe(false);
    expect(canFallbackFromDocumentWorker(new Error("unexpected"))).toBe(false);
  });

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
              font_name: "ABCDEE+Helvetica-Bold",
              font_size: 18,
              font_weight: 700,
              font_style: "normal",
            },
            {
              text: "OCR 补充",
              bbox: { x0: 60, top: 400, x1: 540, bottom: 480 },
              source: "ocr",
              confidence: 0.9,
              font_name: null,
              font_size: null,
              font_weight: null,
              font_style: null,
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
    expect(result.blocks[1].bbox).toEqual({
      x: 0.1,
      y: 0.5,
      width: 0.8,
      height: 0.1,
    });
    expect(result.blocks[0].style).toEqual({
      fontFamily: "ABCDEE+Helvetica-Bold",
      fontSize: 18,
      fontWeight: 700,
      fontStyle: "normal",
    });
    expect(result.blocks[1].style).toBeUndefined();
  });

  it("rejects a worker response whose digest does not match the uploaded PDF", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic fixture");
    vi.stubEnv("DOCUMENT_WORKER_URL", "http://worker.internal");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
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
                kind: "digital",
                metrics: { native_character_count: 8 },
                blocks: [
                  {
                    text: "Candidate",
                    bbox: { x0: 60, top: 80, x1: 240, bottom: 110 },
                    source: "native",
                    confidence: 1,
                  },
                ],
                preview_png_base64: Buffer.from("preview").toString("base64"),
              },
            ],
            warnings: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      parseWithDocumentWorker({ bytes, fileName: "candidate.pdf" }),
    ).rejects.toMatchObject({
      code: "WORKER_DIGEST_MISMATCH",
      status: 502,
    });
  });

  it("normalizes an invalid success payload into a recoverable worker error", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic fixture");
    vi.stubEnv("DOCUMENT_WORKER_URL", "http://worker.internal");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ invalid: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      parseWithDocumentWorker({ bytes, fileName: "candidate.pdf" }),
    ).rejects.toMatchObject({
      code: "WORKER_INVALID_RESPONSE",
      status: 502,
    });
  });
});
