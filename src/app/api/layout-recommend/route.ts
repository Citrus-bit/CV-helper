import { z } from "zod";

import { invokeBaselineCapability } from "@/lib/baseline";
import { LayoutRecommendationSchema } from "@/lib/client/contracts";
import { ResumeASTSchema } from "@/lib/domain";
import { createCapabilityContext } from "@/lib/server/analysis";
import { jsonResponse, parseJsonBody, routeErrorResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  ast: ResumeASTSchema,
  targetPages: z.number().int().min(1).max(2),
  preferredTemplate: z.enum(["professional", "minimal", "compact"]).optional(),
});

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, RequestSchema);
    const context = createCapabilityContext(input.ast.locale, ["resume_ast"], request.signal);
    const result = await invokeBaselineCapability("layout.recommend", input, context);
    return jsonResponse(LayoutRecommendationSchema.parse(result.data), {
      headers: { "x-capability-trace": result.sourceVersion },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
