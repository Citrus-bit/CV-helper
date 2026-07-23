import { z } from "zod";

import { invokeBaselineCapability } from "@/lib/baseline";
import { RenderResponseSchema } from "@/lib/client/contracts";
import { ResumeASTSchema } from "@/lib/domain";
import { createCapabilityContext } from "@/lib/server/analysis";
import { jsonResponse, parseJsonBody, RequestInputError, routeErrorResponse } from "@/lib/server/http";

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

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 2 * 1_024 * 1_024) {
      throw new RequestInputError("结构化简历超过 2 MB 渲染限制。", 413);
    }
    const input = await parseJsonBody(request, RequestSchema);
    const context = createCapabilityContext(input.ast.locale, ["resume_ast", "rendered_document"], request.signal);
    const rendered = await invokeBaselineCapability("resume.render", input, context);
    const audited = await invokeBaselineCapability(
      "export.audit",
      {
        ...input,
        pdfBase64: rendered.data.pdfBase64,
        expectedSha256: rendered.data.sha256,
      },
      context,
    );
    return jsonResponse(
      RenderResponseSchema.parse({
        template: input.template,
        pdfBase64: rendered.data.pdfBase64,
        sha256: audited.data.sha256,
        byteLength: rendered.data.byteLength,
        searchableText: audited.data.searchableText,
        astContentCovered: audited.data.astContentCovered,
        hardGate: audited.data.hardGate,
        report: audited.data.report,
      }),
      {
        headers: {
          "x-capability-trace": `${rendered.sourceVersion},${audited.sourceVersion}`,
        },
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
