import { randomUUID } from "node:crypto";

import { z } from "zod";

import { invokeBaselineCapability } from "@/lib/baseline";
import { unwrapUntrustedDocumentText } from "@/lib/baseline/utils";
import { AI_CAPABILITY_TIMEOUT_MS } from "@/lib/capabilities/catalog";
import { JobMatchBundleSchema } from "@/lib/client/contracts";
import {
  ClaimSchema,
  EvidenceAssetSchema,
  JobPostingSchema,
  ResumeASTSchema,
  ResumeVariantSchema,
} from "@/lib/domain";
import { createCapabilityContext } from "@/lib/server/analysis";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { invokeRequiredAiCapability } from "@/lib/server/capability-runtime";
import { jsonResponse, parseJsonBody, routeErrorResponse } from "@/lib/server/http";
import { buildJobVariant } from "@/lib/server/job-variant";

export const runtime = "nodejs";

function optionalSingleLine(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .refine(
      (value) => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value),
      {
        message: "岗位元信息必须为单行文本。",
      },
    )
    .transform((value) => value.trim() || undefined)
    .optional();
}

const RequestSchema = z.object({
  jdText: z
    .string()
    .max(60_000)
    .refine((value) => value.trim().length >= 30, {
      message: "岗位描述至少需要 30 个字符。",
    }),
  jobTitle: optionalSingleLine(120),
  seniority: optionalSingleLine(80),
  location: optionalSingleLine(160),
  language: z.enum(["zh-CN", "en-US"]).optional(),
  resumeId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  ast: ResumeASTSchema,
  claims: z.array(ClaimSchema).max(500),
  evidence: z.array(EvidenceAssetSchema).max(500),
});

type MetadataKey = "jobTitle" | "seniority" | "location";

async function secureMetadataValue(
  value: string | undefined,
  context: ReturnType<typeof createCapabilityContext>,
) {
  if (!value) return undefined;
  const redaction = await invokeBaselineCapability(
    "pii.redact",
    { text: value },
    context,
  );
  const guard = await invokeBaselineCapability(
    "prompt.guard",
    { text: redaction.data.redactedText },
    context,
  );
  return {
    value: unwrapUntrustedDocumentText(guard.data.safeText),
    suspicious: guard.data.suspicious,
    sourceVersions: [redaction.sourceVersion, guard.sourceVersion],
  };
}

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, RequestSchema);
    await enforceAiRateLimit(request, "jd");
    const capabilityLocale = input.language ?? input.ast.locale;
    const securityContext = createCapabilityContext(
      capabilityLocale,
      ["selected_text"],
      request.signal,
    );
    const redactionResult = await invokeBaselineCapability("pii.redact", { text: input.jdText }, securityContext);
    const guardResult = await invokeBaselineCapability(
      "prompt.guard",
      { text: redactionResult.data.redactedText },
      securityContext,
    );
    const metadataEntries = await Promise.all(
      (["jobTitle", "seniority", "location"] as const).map(async (key) => [
        key,
        await secureMetadataValue(input[key], securityContext),
      ] as const),
    );
    const metadata = Object.fromEntries(metadataEntries) as Record<
      MetadataKey,
      Awaited<ReturnType<typeof secureMetadataValue>>
    >;
    const context = createCapabilityContext(
      capabilityLocale,
      ["job_description", "evidence_graph", "resume_ast"],
      request.signal,
      AI_CAPABILITY_TIMEOUT_MS,
    );
    const parsedJob = await invokeRequiredAiCapability(
      "jd.parse",
      {
        text: guardResult.data.safeText,
        locale: capabilityLocale,
        title: metadata.jobTitle?.value,
        location: metadata.location?.value,
      },
      context,
    );
    const finalPosting = JobPostingSchema.parse({
      ...parsedJob.data.jobPosting,
      title: metadata.jobTitle?.value ?? parsedJob.data.jobPosting.title,
      seniority:
        metadata.seniority?.value ?? parsedJob.data.jobPosting.seniority,
      location: metadata.location?.value ?? parsedJob.data.jobPosting.location,
      locale: capabilityLocale,
      rawText: input.jdText,
    });
    const [matchResult, riskResult] = await Promise.all([
      invokeRequiredAiCapability(
        "job.match",
        {
          requirements: parsedJob.data.requirements,
          claims: input.claims,
          evidenceAssets: input.evidence,
        },
        context,
      ),
      invokeBaselineCapability(
        "job.riskDetect",
        { jobPosting: finalPosting },
        context,
      ),
    ]);
    const variantResult = buildJobVariant({
      ast: input.ast,
      targetTitle: finalPosting.title,
      requirements: parsedJob.data.requirements,
      mappings: matchResult.data.maps,
      claims: input.claims,
    });
    const variant = variantResult
      ? ResumeVariantSchema.parse({
          id: `variant-${randomUUID()}`,
          baseResumeId: input.resumeId,
          baseRevision: input.revision,
          revision: 0,
          jobPostingId: finalPosting.id,
          name: `${finalPosting.title}定制版`,
          ast: variantResult.ast,
          appliedSuggestionIds: [],
          changes: variantResult.changes,
        })
      : undefined;
    const risks = riskResult.data.risks.map((risk) => `${risk.explanation}（${risk.excerpt}）`);
    if (guardResult.data.suspicious) risks.unshift("岗位文本包含类似指令的内容，已按不可信数据处理。");
    if (Object.values(metadata).some((result) => result?.suspicious)) {
      risks.unshift("岗位元信息包含类似指令的内容，已按不可信数据处理。");
    }
    return jsonResponse(
      JobMatchBundleSchema.parse({
        sourceResumeId: input.resumeId,
        sourceResumeRevision: input.revision,
        job: finalPosting,
        requirements: parsedJob.data.requirements,
        mappings: matchResult.data.maps,
        coverage: matchResult.data.evidenceCoverageRate,
        summary: matchResult.data.disclaimer,
        riskFlags: risks,
        capabilityVersions: {
          "jd.parse": parsedJob.sourceVersion,
          "job.match": matchResult.sourceVersion,
        },
        variant,
        variantUnavailableReason: variant
          ? undefined
          : "当前求职意向与内容顺序已经是现有证据下最相关的版本，因此未生成无差异的岗位版。",
      }),
      {
        headers: {
          "x-capability-trace": [...new Set([
            guardResult.sourceVersion,
            redactionResult.sourceVersion,
            ...Object.values(metadata).flatMap(
              (result) => result?.sourceVersions ?? [],
            ),
            parsedJob.sourceVersion,
            matchResult.sourceVersion,
            riskResult.sourceVersion,
          ])].join(","),
        },
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
