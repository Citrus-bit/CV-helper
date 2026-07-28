import {
  EvidenceRewriteRequestSchema,
  EvidenceRewriteResponseSchema,
} from "@/lib/client/contracts";
import { AI_CAPABILITY_TIMEOUT_MS } from "@/lib/capabilities/catalog";
import { numericTokens } from "@/lib/baseline/utils";
import { createCapabilityContext } from "@/lib/server/analysis";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { invokeRequiredAiCapability } from "@/lib/server/capability-runtime";
import {
  jsonResponse,
  parseJsonBodyLimited,
  routeErrorResponse,
} from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 32 * 1_024;

function preserveResumeTerms(value: string) {
  const technicalTerms =
    value.match(/[A-Za-z][A-Za-z0-9.+#_-]{1,40}/g) ?? [];
  const measuredValues =
    value.match(/\d+(?:\.\d+)?\s*(?:ms|qps|rps|s|%|％|万|亿)?/gi) ?? [];
  return [
    ...new Set([
      ...technicalTerms,
      ...measuredValues.map((term) => term.replace(/\s+/g, "")),
      ...numericTokens(value),
    ]),
  ].slice(0, 60);
}

export async function POST(request: Request) {
  try {
    const input = await parseJsonBodyLimited(
      request,
      EvidenceRewriteRequestSchema,
      MAX_REQUEST_BYTES,
      "补充内容过多，请精简后重试。",
    );
    await enforceAiRateLimit(request, "chat");
    const capabilityId =
      input.locale === "en-US" ? "copy.rewrite.en" : "copy.rewrite.zh";
    const sourceText = `${input.originalText}\n${input.supplementalFacts}`;
    const context = createCapabilityContext(
      input.locale,
      ["resume_ast"],
      request.signal,
      AI_CAPABILITY_TIMEOUT_MS,
    );
    const result = await invokeRequiredAiCapability(
      capabilityId,
      {
        text: sourceText,
        preserveTerms: preserveResumeTerms(sourceText),
      },
      context,
    );
    return jsonResponse(
      EvidenceRewriteResponseSchema.parse({
        resumeId: input.resumeId,
        resumeRevision: input.resumeRevision,
        suggestionId: input.suggestionId,
        rewrittenText: result.data.rewritten,
        sourceVersion: result.sourceVersion,
        durationMs: result.durationMs,
      }),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
