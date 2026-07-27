import { z } from "zod";

import { AI_CAPABILITY_TIMEOUT_MS } from "@/lib/capabilities/catalog";
import { ClaimSchema, ResumeDocumentSchema, SuggestionSchema } from "@/lib/domain";
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

const MAX_REQUEST_BYTES = 512 * 1_024;

const RequestSchema = z.object({
  resume: ResumeDocumentSchema,
  claims: z.array(ClaimSchema).max(500),
});

const ResponseSchema = z.object({
  suggestions: z.array(SuggestionSchema),
  sourceVersion: z.string().min(1),
  durationMs: z.number().nonnegative(),
});

export async function POST(request: Request) {
  try {
    const input = await parseJsonBodyLimited(
      request,
      RequestSchema,
      MAX_REQUEST_BYTES,
      "当前简历内容过多，无法重新生成建议。",
    );
    await enforceAiRateLimit(request, "analysis");
    const context = createCapabilityContext(
      input.resume.locale,
      ["source_blocks", "resume_ast", "evidence_graph"],
      request.signal,
      AI_CAPABILITY_TIMEOUT_MS,
    );
    const result = await invokeCapability(
      "resume.suggest",
      input,
      context,
    );
    if (
      result.usedFallback ||
      !/^resume\.suggest@(?:[2-9]|\d{2,})\./.test(result.sourceVersion)
    ) {
      throw new RequestInputError(
        "AI 建议生成未完成，未使用本地模板替代，请稍后重试。",
        503,
      );
    }
    return jsonResponse(
      ResponseSchema.parse({
        suggestions: result.data.suggestions,
        sourceVersion: result.sourceVersion,
        durationMs: result.durationMs,
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
