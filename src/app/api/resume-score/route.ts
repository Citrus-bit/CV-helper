import {
  ResumeAnalysisRequestSchema,
  ResumeScoreResponseSchema,
} from "@/lib/client/contracts";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import {
  jsonResponse,
  parseJsonBodyLimited,
  routeErrorResponse,
} from "@/lib/server/http";
import { scoreResumeRevisionWithAi } from "@/lib/server/resume-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 512 * 1_024;

export async function POST(request: Request) {
  try {
    const input = await parseJsonBodyLimited(
      request,
      ResumeAnalysisRequestSchema,
      MAX_REQUEST_BYTES,
      "当前简历内容过多，无法完成最终评分。",
    );
    await enforceAiRateLimit(request, "analysis");
    return jsonResponse(
      ResumeScoreResponseSchema.parse(
        await scoreResumeRevisionWithAi({
          ...input,
          signal: request.signal,
        }),
      ),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
