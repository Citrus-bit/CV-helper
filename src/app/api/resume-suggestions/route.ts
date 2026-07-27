import { z } from "zod";

import { ClaimSchema, ResumeDocumentSchema, SuggestionSchema } from "@/lib/domain";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { analyzeResumeRevisionWithAi } from "@/lib/server/resume-analysis";
import {
  jsonResponse,
  parseJsonBodyLimited,
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
    const result = await analyzeResumeRevisionWithAi({
      ...input,
      signal: request.signal,
    });
    return jsonResponse(
      ResponseSchema.parse({
        suggestions: result.suggestions,
        sourceVersion: result.capabilityVersions["resume.suggest"],
        durationMs: result.durationMs,
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
