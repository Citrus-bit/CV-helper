import { createHash } from "node:crypto";
import { z } from "zod";

import { DocumentParseOutputSchema } from "@/lib/baseline/contracts";

const WorkerBoundingBoxSchema = z.object({
  x0: z.number(),
  top: z.number(),
  x1: z.number(),
  bottom: z.number(),
});

const WorkerTextBlockSchema = z.object({
  text: z.string(),
  bbox: WorkerBoundingBoxSchema,
  source: z.enum(["native", "ocr"]),
  confidence: z.number().min(0).max(1),
  font_name: z.string().trim().min(1).max(256).nullish(),
  font_size: z.number().positive().max(1_000).nullish(),
  font_weight: z.number().int().min(100).max(900).nullish(),
  font_style: z.enum(["normal", "italic"]).nullish(),
});

const WorkerParseResponseSchema = z.object({
  filename: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  page_count: z.number().int().positive(),
  pages: z.array(
    z.object({
      page_number: z.number().int().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
      preview_width: z.number().int().positive().nullable().optional(),
      preview_height: z.number().int().positive().nullable().optional(),
      kind: z.enum(["digital", "scan", "mixed"]),
      metrics: z
        .object({ native_character_count: z.number().int().nonnegative() })
        .passthrough(),
      blocks: z.array(WorkerTextBlockSchema),
      preview_png_base64: z.string().min(4).nullable(),
    }),
  ),
  warnings: z.array(
    z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      page_number: z.number().int().positive().nullable().optional(),
    }),
  ),
});

type WorkerParseResponse = z.infer<typeof WorkerParseResponseSchema>;

export class DocumentWorkerError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DocumentWorkerError";
  }
}

export function canFallbackFromDocumentWorker(error: unknown) {
  return Boolean(
    error instanceof DocumentWorkerError &&
    error.code !== "WORKER_DIGEST_MISMATCH" &&
    error.status !== 413,
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function blockStyle(block: z.infer<typeof WorkerTextBlockSchema>) {
  const style = {
    fontFamily: block.font_name ?? undefined,
    fontSize: block.font_size ?? undefined,
    fontWeight: block.font_weight ?? undefined,
    fontStyle: block.font_style ?? undefined,
  };
  return Object.values(style).some((value) => value !== undefined)
    ? style
    : undefined;
}

export function mapWorkerParseResponse(input: WorkerParseResponse) {
  const parsed = WorkerParseResponseSchema.parse(input);
  const blocks = parsed.pages.flatMap((page) =>
    page.blocks
      .map((block, order) => ({
        id: `p${page.page_number}-${block.source}-${order + 1}`,
        pageIndex: page.page_number - 1,
        order,
        text: block.text.trim(),
        source: block.source,
        confidence: block.confidence,
        bbox: {
          x: clamp(block.bbox.x0 / page.width),
          y: clamp(block.bbox.top / page.height),
          width: clamp((block.bbox.x1 - block.bbox.x0) / page.width),
          height: clamp((block.bbox.bottom - block.bbox.top) / page.height),
        },
        role: "unknown" as const,
        style: blockStyle(block),
      }))
      .filter((block) => block.text.length > 0),
  );
  const hadNative = blocks.some((block) => block.source === "native");
  const hadOcr = blocks.some((block) => block.source === "ocr");

  return DocumentParseOutputSchema.parse({
    fileName: parsed.filename,
    pageCount: parsed.page_count,
    text: blocks.map((block) => block.text).join("\n"),
    blocks,
    pages: parsed.pages.map((page) => {
      if (!page.preview_png_base64) {
        throw new DocumentWorkerError(
          "隔离文档服务未返回页面预览。",
          "MISSING_PREVIEW",
          502,
        );
      }
      return {
        pageIndex: page.page_number - 1,
        width: page.width,
        height: page.height,
        previewWidth: page.preview_width ?? undefined,
        previewHeight: page.preview_height ?? undefined,
        source: page.kind,
        nativeCharacterCount: page.metrics.native_character_count,
        previewMimeType: "image/png" as const,
        previewBase64: page.preview_png_base64,
      };
    }),
    warnings: parsed.warnings.map(
      (warning) =>
        `${warning.page_number ? `第 ${warning.page_number} 页：` : ""}${warning.message}`,
    ),
    extractionMode:
      hadNative && hadOcr ? "mixed" : hadOcr || !hadNative ? "ocr" : "native",
  });
}

export async function parseWithDocumentWorker(input: {
  bytes: Uint8Array;
  fileName: string;
  signal?: AbortSignal;
}) {
  const workerUrl = process.env.DOCUMENT_WORKER_URL?.replace(/\/+$/, "");
  if (!workerUrl) return null;

  const form = new FormData();
  form.set(
    "file",
    new Blob([Buffer.from(input.bytes)], { type: "application/pdf" }),
    input.fileName,
  );
  const timeoutSignal = AbortSignal.timeout(180_000);
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutSignal])
    : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(`${workerUrl}/parse?include_previews=true`, {
      method: "POST",
      body: form,
      signal,
    });
  } catch (error) {
    if (input.signal?.aborted) throw error;
    throw new DocumentWorkerError(
      "隔离文档服务暂时不可用。",
      "WORKER_UNAVAILABLE",
      503,
    );
  }

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string } } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // The worker error body is intentionally optional.
    }
    throw new DocumentWorkerError(
      payload.error?.message ?? "隔离文档服务无法解析这份 PDF。",
      payload.error?.code ?? "WORKER_PARSE_FAILED",
      response.status === 413 ? 413 : response.status >= 500 ? 502 : 400,
    );
  }

  let workerResult: WorkerParseResponse;
  try {
    workerResult = WorkerParseResponseSchema.parse(await response.json());
  } catch (error) {
    if (input.signal?.aborted) throw error;
    throw new DocumentWorkerError(
      "隔离文档服务返回了无效的解析结果。",
      "WORKER_INVALID_RESPONSE",
      502,
    );
  }
  const expectedSha256 = createHash("sha256").update(input.bytes).digest("hex");
  if (workerResult.sha256 !== expectedSha256) {
    throw new DocumentWorkerError(
      "隔离文档服务返回的文件摘要与上传内容不一致。",
      "WORKER_DIGEST_MISMATCH",
      502,
    );
  }
  let data: ReturnType<typeof mapWorkerParseResponse>;
  try {
    data = mapWorkerParseResponse(workerResult);
  } catch (error) {
    if (error instanceof DocumentWorkerError) throw error;
    throw new DocumentWorkerError(
      "隔离文档服务返回了无法使用的页面数据。",
      "WORKER_INVALID_RESPONSE",
      502,
    );
  }
  return {
    data,
    sourceVersion: "document.parse@1.0.0+isolated-worker",
    warnings: data.warnings.map((message) => ({
      code: "DOCUMENT_WORKER_WARNING",
      message,
    })),
    isolated: true as const,
  };
}
