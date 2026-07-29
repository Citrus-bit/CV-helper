import { z } from "zod";

import { invokeBaselineCapability } from "@/lib/baseline";
import {
  RenderResponseSchema,
  type RenderResponse,
} from "@/lib/client/contracts";
import { ResumeASTSchema } from "@/lib/domain";
import { createCapabilityContext } from "@/lib/server/analysis";
import {
  jsonResponse,
  parseJsonBody,
  RequestInputError,
  routeErrorResponse,
} from "@/lib/server/http";
import type { ResumeTemplateId } from "@/lib/server/typst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  resumeId: z.string().min(1).max(200),
  revision: z.number().int().nonnegative(),
  ast: ResumeASTSchema.superRefine((ast, context) => {
    const entries = ast.sections.reduce((count, section) => count + section.entries.length, 0);
    const bullets = ast.sections.reduce(
      (count, section) => count + section.entries.reduce((entryCount, entry) => entryCount + entry.bullets.length, 0),
      0,
    );
    if (ast.sections.length > 30 || entries > 300 || bullets > 2_000) {
      context.addIssue({ code: "custom", message: "简历结构超出渲染数量限制。" });
    }
  }),
  template: z.enum(["professional", "minimal", "compact"]),
  sourcePageCount: z.number().int().positive().optional(),
});

const templates = ["professional", "minimal", "compact"] as const;

function fallbackTemplateOrder(
  preferred: ResumeTemplateId,
  ranked: readonly ResumeTemplateId[] = [],
) {
  return [...new Set([...ranked, preferred, ...templates])];
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 2 * 1_024 * 1_024) {
      throw new RequestInputError("结构化简历超过 2 MB 渲染限制。", 413);
    }
    const input = await parseJsonBody(request, RequestSchema);
    const context = createCapabilityContext(
      input.ast.locale,
      ["resume_ast", "rendered_document"],
      request.signal,
      45_000,
    );
    const traces: string[] = [];
    const recommendation = await invokeBaselineCapability(
      "layout.recommend",
      {
        ast: input.ast,
        targetPages: 1,
        preferredTemplate: input.template,
      },
      context,
    );
    traces.push(recommendation.sourceVersion);
    const rankedTemplates = recommendation.data.rankings.map(
      (ranking) => ranking.template,
    );

    let bestFailedCandidate: RenderResponse | null = null;
    let lastError: unknown;
    for (const template of fallbackTemplateOrder(
      input.template,
      rankedTemplates,
    )) {
      try {
        const candidateInput = { ...input, template };
        const rendered = await invokeBaselineCapability(
          "resume.render",
          candidateInput,
          context,
        );
        const audited = await invokeBaselineCapability(
          "export.audit",
          {
            ...candidateInput,
            pdfBase64: rendered.data.pdfBase64,
            expectedSha256: rendered.data.sha256,
          },
          context,
        );
        traces.push(rendered.sourceVersion, audited.sourceVersion);
        const candidate = RenderResponseSchema.parse({
          template,
          pdfBase64: rendered.data.pdfBase64,
          sha256: audited.data.sha256,
          byteLength: rendered.data.byteLength,
          searchableText: audited.data.searchableText,
          astContentCovered: audited.data.astContentCovered,
          hardGate: audited.data.hardGate,
          report: audited.data.report,
        });
        if (candidate.hardGate.passed && candidate.report.downloadable) {
          return jsonResponse(candidate, {
            headers: { "x-capability-trace": traces.join(",") },
          });
        }
        if (
          !bestFailedCandidate ||
          candidate.hardGate.blockingCheckIds.length <
            bestFailedCandidate.hardGate.blockingCheckIds.length ||
          (candidate.hardGate.blockingCheckIds.length ===
            bestFailedCandidate.hardGate.blockingCheckIds.length &&
            candidate.report.overallScore >
              bestFailedCandidate.report.overallScore)
        ) {
          bestFailedCandidate = candidate;
        }
      } catch (error) {
        if (request.signal.aborted) throw error;
        lastError = error;
      }
    }

    if (bestFailedCandidate) {
      return jsonResponse(bestFailedCandidate, {
        headers: { "x-capability-trace": traces.join(",") },
      });
    }
    throw lastError ?? new Error("后台未能生成可用的 PDF。");
  } catch (error) {
    return routeErrorResponse(error);
  }
}
