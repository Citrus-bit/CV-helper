import { z } from "zod";

const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const ALLOWED_LOCAL_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "funasr",
  "speech-worker",
]);

const FunAsrResponseSchema = z.object({
  text: z.string().max(50_000),
});

export class FunAsrError extends Error {
  constructor(readonly code: "UNCONFIGURED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("本地增强语音转写暂时不可用。");
    this.name = "FunAsrError";
  }
}

function configuredBaseUrl() {
  const raw = process.env.FUNASR_API_BASE?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FunAsrError("UNCONFIGURED");
  }
  if (
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !ALLOWED_LOCAL_HOSTS.has(url.hostname)
  ) {
    throw new FunAsrError("UNCONFIGURED");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

function timeoutMs() {
  const configured = Number(process.env.FUNASR_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.min(Math.max(Math.trunc(configured), 5_000), 180_000)
    : DEFAULT_TIMEOUT_MS;
}

async function readJsonLimited(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new FunAsrError("INVALID_RESPONSE");
  }
  if (!response.body) throw new FunAsrError("INVALID_RESPONSE");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new FunAsrError("INVALID_RESPONSE");
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
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new FunAsrError("INVALID_RESPONSE");
  }
}

export function isFunAsrConfigured() {
  try {
    return configuredBaseUrl() !== null;
  } catch {
    return false;
  }
}

export async function transcribeWithFunAsr(input: {
  audio: Uint8Array;
  fileName: string;
  mimeType: string;
  locale: "zh-CN" | "en-US" | "zh-TW" | "mixed";
  signal?: AbortSignal;
}) {
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) throw new FunAsrError("UNCONFIGURED");

  const form = new FormData();
  form.set(
    "file",
    new Blob([Buffer.from(input.audio)], { type: input.mimeType }),
    input.fileName,
  );
  form.set("model", process.env.FUNASR_MODEL?.trim() || "sensevoice");
  form.set("response_format", "json");
  if (input.locale !== "mixed") {
    form.set("language", input.locale === "en-US" ? "en" : "zh");
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs());
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutSignal])
    : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(new URL("v1/audio/transcriptions", baseUrl), {
      method: "POST",
      body: form,
      signal,
    });
  } catch (error) {
    if (input.signal?.aborted) throw error;
    throw new FunAsrError("UNAVAILABLE");
  }
  if (!response.ok) throw new FunAsrError("UNAVAILABLE");

  const parsed = FunAsrResponseSchema.safeParse(await readJsonLimited(response));
  if (!parsed.success) throw new FunAsrError("INVALID_RESPONSE");
  const transcript = parsed.data.text.trim();
  if (!transcript) throw new FunAsrError("INVALID_RESPONSE");
  return transcript;
}
