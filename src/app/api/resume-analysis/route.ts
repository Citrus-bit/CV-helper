import {
  ResumeAnalysisRequestSchema,
  ResumeAnalysisResponseSchema,
} from "@/lib/client/contracts";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import {
  jsonResponse,
  parseJsonBodyLimited,
  routeErrorResponse,
} from "@/lib/server/http";
import {
  analyzeResumeRevisionWithAi,
  assertResumeAnalysisResponseForRequest,
} from "@/lib/server/resume-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 512 * 1_024;

export async function POST(request: Request) {
  try {
    const input = await parseJsonBodyLimited(
      request,
      ResumeAnalysisRequestSchema,
      MAX_REQUEST_BYTES,
      "当前简历内容过多，无法重新进行 AI 分析。",
    );
    await enforceAiRateLimit(request, "analysis");
    const result = ResumeAnalysisResponseSchema.parse(
      await analyzeResumeRevisionWithAi({
        ...input,
        signal: request.signal,
      }),
    );
    return jsonResponse(
      assertResumeAnalysisResponseForRequest(result, input.resume),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
