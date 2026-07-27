import { AI_CAPABILITY_TIMEOUT_MS } from "@/lib/capabilities/catalog";
import {
  ResumeChatInputSchema,
  ResumeChatResponseSchema,
} from "@/lib/resume-chat";
import { createCapabilityContext } from "@/lib/server/analysis";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { invokeCapability } from "@/lib/server/capability-runtime";
import {
  jsonResponse,
  parseJsonBodyLimited,
  RequestInputError,
  routeErrorResponse,
} from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 768 * 1_024;

export async function POST(request: Request) {
  try {
    const input = await parseJsonBodyLimited(
      request,
      ResumeChatInputSchema,
      MAX_REQUEST_BYTES,
      "当前对话上下文过多，请清理对话后重试。",
    );
    await enforceAiRateLimit(request, "chat");
    const context = createCapabilityContext(
      input.resume.locale,
      ["source_blocks", "resume_ast", "evidence_graph", "interview_content"],
      request.signal,
      AI_CAPABILITY_TIMEOUT_MS,
    );
    const result = await invokeCapability("resume.chat", input, context);
    if (
      result.usedFallback ||
      !/^resume\.chat@(?:[2-9]|\d{2,})\./.test(result.sourceVersion)
    ) {
      throw new RequestInputError(
        "AI 编辑未完成，未使用本地话术替代，请稍后重试。",
        503,
      );
    }
    return jsonResponse(
      ResumeChatResponseSchema.parse({
        ...result.data,
        sourceVersion: result.sourceVersion,
        durationMs: result.durationMs,
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
