import { randomUUID } from "node:crypto";

import { z } from "zod";

import { invokeBaselineCapability } from "@/lib/baseline";
import { JobMatchBundleSchema } from "@/lib/client/contracts";
import { ClaimSchema, EvidenceAssetSchema, ResumeASTSchema, ResumeVariantSchema } from "@/lib/domain";
import { createCapabilityContext } from "@/lib/server/analysis";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { invokeCapability } from "@/lib/server/capability-runtime";
import { jsonResponse, parseJsonBody, routeErrorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const RequestSchema = z.object({
  jdText: z.string().trim().min(30).max(60_000),
  resumeId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  ast: ResumeASTSchema,
  claims: z.array(ClaimSchema).max(500),
  evidence: z.array(EvidenceAssetSchema).max(500),
});

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, RequestSchema);
    await enforceAiRateLimit(request, "jd");
    const securityContext = createCapabilityContext(
      input.ast.locale,
      ["selected_text"],
      request.signal,
    );
    const redactionResult = await invokeBaselineCapability("pii.redact", { text: input.jdText }, securityContext);
    const guardResult = await invokeBaselineCapability(
      "prompt.guard",
      { text: redactionResult.data.redactedText },
      securityContext,
    );
    const context = createCapabilityContext(
      input.ast.locale,
      ["job_description", "evidence_graph", "resume_ast"],
      request.signal,
    );
    const parsedJob = await invokeCapability(
      "jd.parse",
      { text: guardResult.data.safeText, locale: input.ast.locale },
      context,
    );
    const [matchResult, riskResult] = await Promise.all([
      invokeCapability(
        "job.match",
        {
          requirements: parsedJob.data.requirements,
          claims: input.claims,
          evidenceAssets: input.evidence,
        },
        context,
      ),
      invokeBaselineCapability("job.riskDetect", { jobPosting: parsedJob.data.jobPosting }, context),
    ]);
    const variant = ResumeVariantSchema.parse({
      id: `variant-${randomUUID()}`,
      baseResumeId: input.resumeId,
      baseRevision: input.revision,
      revision: 0,
      jobPostingId: parsedJob.data.jobPosting.id,
      name: `${parsedJob.data.jobPosting.title}定制版`,
      ast: input.ast,
      appliedSuggestionIds: [],
    });
    const risks = riskResult.data.risks.map((risk) => `${risk.explanation}（${risk.excerpt}）`);
    if (guardResult.data.suspicious) risks.unshift("岗位文本包含类似指令的内容，已按不可信数据处理。");
    return jsonResponse(
      JobMatchBundleSchema.parse({
        sourceResumeId: input.resumeId,
        sourceResumeRevision: input.revision,
        job: { ...parsedJob.data.jobPosting, rawText: input.jdText },
        requirements: parsedJob.data.requirements,
        mappings: matchResult.data.maps,
        coverage: matchResult.data.evidenceCoverageRate,
        summary: matchResult.data.disclaimer,
        riskFlags: risks,
        variant,
      }),
      {
        headers: {
          "x-capability-trace": [
            guardResult.sourceVersion,
            redactionResult.sourceVersion,
            parsedJob.sourceVersion,
            matchResult.sourceVersion,
            riskResult.sourceVersion,
          ].join(","),
        },
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
