import { z } from "zod";

import { CapabilityInvocationError } from "@/lib/capabilities";
import { PdfInputError } from "@/lib/server/pdf";
import { DocumentWorkerError } from "@/lib/server/document-worker";
import { AiRateLimitError } from "@/lib/server/ai-rate-limit";

const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

export class RequestInputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "RequestInputError";
  }
}

export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...init.headers },
  });
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new RequestInputError("请求体不是有效的 JSON。");
  }
  return schema.parse(value);
}

async function readBodyLimited(
  request: Request,
  maxBytes: number,
  tooLargeMessage: string,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RequestInputError("请求体大小限制配置无效。", 500);
  }
  if (!request.body) {
    throw new RequestInputError("请求中没有内容。");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestInputError(tooLargeMessage, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function parseJsonBodyLimited<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes: number,
  tooLargeMessage = "请求体超过大小限制。",
): Promise<T> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      Number.isFinite(parsedLength) &&
      parsedLength >= 0 &&
      parsedLength > maxBytes
    ) {
      throw new RequestInputError(tooLargeMessage, 413);
    }
  }

  const body = await readBodyLimited(request, maxBytes, tooLargeMessage);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new RequestInputError("请求体不是有效的 JSON。");
  }
  return schema.parse(value);
}

export async function parseFormDataBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const body = await readBodyLimited(
    request,
    maxBytes,
    "PDF 超过 10 MB，请压缩后重试。",
  );

  try {
    return await new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: new Blob([Uint8Array.from(body)]),
      signal: request.signal,
    }).formData();
  } catch (error) {
    if (error instanceof RequestInputError) throw error;
    throw new RequestInputError("上传表单无法解析，请重新选择 PDF。");
  }
}

function pdfStatus(error: PdfInputError) {
  if (error.code === "TOO_LARGE") return 413;
  return 400;
}

export function routeErrorResponse(error: unknown) {
  if (error instanceof AiRateLimitError) {
    return jsonResponse(
      { error: error.message, code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "retry-after": String(error.retryAfterSeconds) },
      },
    );
  }
  if (error instanceof RequestInputError) {
    return jsonResponse(
      {
        error: error.message,
        code: error.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST",
      },
      { status: error.status },
    );
  }
  if (error instanceof PdfInputError) {
    return jsonResponse(
      { error: error.message, code: error.code },
      { status: pdfStatus(error) },
    );
  }
  if (error instanceof DocumentWorkerError) {
    return jsonResponse(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof z.ZodError) {
    return jsonResponse(
      {
        error: "请求数据不完整或格式不正确。",
        code: "INVALID_REQUEST",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }
  if (error instanceof CapabilityInvocationError) {
    if (error.cause instanceof PdfInputError)
      return routeErrorResponse(error.cause);
    const status =
      error.code === "TIMEOUT" ? 504 : error.code === "UNAVAILABLE" ? 503 : 422;
    return jsonResponse(
      {
        error: "内置分析能力暂时无法完成请求。",
        code: error.code,
        details: error.message,
      },
      { status },
    );
  }
  return jsonResponse(
    { error: "服务暂时无法完成请求，请重试。", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
