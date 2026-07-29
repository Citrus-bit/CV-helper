import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import {
  analyzeJobMatch,
  JobMatchInputSchema,
} from "@/lib/server/job-match";
import { jsonResponse, parseJsonBody, routeErrorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, JobMatchInputSchema);
    await enforceAiRateLimit(request, "jd");
    const result = await analyzeJobMatch(input, request.signal);
    return jsonResponse(result.bundle, {
      headers: {
        "x-capability-trace": [...new Set(result.capabilityTrace)].join(","),
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
