import { z } from "zod";

import { invokeBaselineCapability } from "@/lib/baseline";
import { SpeechTranscribeInputSchema } from "@/lib/baseline/contracts";
import { TranscriptionResponseSchema } from "@/lib/client/contracts";
import { LocaleSchema } from "@/lib/domain";
import { createCapabilityContext } from "@/lib/server/analysis";
import { FunAsrError, transcribeWithFunAsr } from "@/lib/server/funasr";
import {
  jsonResponse,
  parseFormDataBodyLimited,
  parseJsonBody,
  RequestInputError,
  routeErrorResponse,
} from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_AUDIO_BYTES + 256 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

async function browserFallback(
  input: z.infer<typeof SpeechTranscribeInputSchema>,
  signal?: AbortSignal,
) {
  const context = createCapabilityContext(
    input.locale,
    ["selected_text"],
    signal,
  );
  const result = await invokeBaselineCapability(
    "speech.transcribe",
    input,
    context,
  );
  return jsonResponse(TranscriptionResponseSchema.parse(result.data), {
    headers: { "x-capability-trace": result.sourceVersion },
  });
}

async function transcribeAudio(request: Request) {
  const form = await parseFormDataBodyLimited(
    request,
    MAX_MULTIPART_BYTES,
    "录音超过 12 MB，请缩短回答后重试。",
  );
  const audio = form.get("audio");
  if (!(audio instanceof File)) throw new RequestInputError("录音文件缺失。");
  const mimeType = audio.type.toLowerCase().split(";", 1)[0].trim();
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
    throw new RequestInputError("当前录音格式不受支持。", 415);
  }
  if (!audio.size) throw new RequestInputError("录音内容为空。");
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new RequestInputError("录音超过 12 MB，请缩短回答后重试。", 413);
  }

  const locale = LocaleSchema.parse(form.get("locale"));
  const browserTranscript = z
    .string()
    .max(50_000)
    .parse(form.get("browserTranscript") ?? "");
  const confidenceValue = form.get("browserConfidence");
  const browserConfidence =
    typeof confidenceValue === "string" && confidenceValue
      ? z.coerce.number().min(0).max(1).parse(confidenceValue)
      : undefined;
  const fallbackInput = SpeechTranscribeInputSchema.parse({
    browserTranscript,
    locale,
    browserConfidence,
    isFinal: true,
  });

  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const transcript = await transcribeWithFunAsr({
      audio: bytes,
      fileName: `interview-answer.${
        mimeType === "audio/mp4" || mimeType === "audio/x-m4a"
          ? "m4a"
          : mimeType === "audio/ogg"
            ? "ogg"
            : mimeType === "audio/mpeg"
              ? "mp3"
              : mimeType === "audio/wav" || mimeType === "audio/x-wav"
                ? "wav"
                : "webm"
      }`,
      mimeType,
      locale,
      signal: request.signal,
    });
    return jsonResponse(
      TranscriptionResponseSchema.parse({
        transcript,
        locale,
        isFinal: true,
        source: "funasr",
        audioProcessed: true,
      }),
      { headers: { "x-capability-trace": "speech.transcribe@funasr" } },
    );
  } catch (error) {
    if (request.signal.aborted) throw error;
    if (error instanceof FunAsrError && browserTranscript.trim()) {
      return browserFallback(fallbackInput, request.signal);
    }
    if (error instanceof FunAsrError) {
      return jsonResponse(
        {
          error: "本地增强语音转写暂时不可用，请直接输入文字回答。",
          code: "SPEECH_TRANSCRIPTION_UNAVAILABLE",
          retryable: true,
        },
        { status: 503 },
      );
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      return await transcribeAudio(request);
    }
    return await browserFallback(
      await parseJsonBody(request, SpeechTranscribeInputSchema),
      request.signal,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
