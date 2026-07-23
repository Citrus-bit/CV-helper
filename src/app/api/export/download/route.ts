import { ExportAuditInputSchema } from "@/lib/baseline/contracts";
import { invokeBaselineCapability } from "@/lib/baseline";
import { createCapabilityContext } from "@/lib/server/analysis";
import {
  parseJsonBodyLimited,
  RequestInputError,
  routeErrorResponse,
} from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const MAX_EXPORT_DOWNLOAD_REQUEST_BYTES = 16 * 1_024 * 1_024;

export async function POST(request: Request) {
  try {
    const input = await parseJsonBodyLimited(
      request,
      ExportAuditInputSchema,
      MAX_EXPORT_DOWNLOAD_REQUEST_BYTES,
      "待下载产物超过 16 MB 复核限制。",
    );
    if (!input.expectedSha256) {
      throw new RequestInputError("下载前必须提供已预览产物的 SHA-256。", 400);
    }

    const context = createCapabilityContext(
      input.ast.locale,
      ["rendered_document", "resume_ast"],
      request.signal,
    );
    const audited = await invokeBaselineCapability(
      "export.audit",
      input,
      context,
    );
    if (!audited.data.hardGate.passed || !audited.data.report.downloadable) {
      throw new RequestInputError(
        `导出复核未通过：${audited.data.hardGate.blockingCheckIds.join(", ") || "unknown"}`,
        409,
      );
    }

    const pdf = Buffer.from(input.pdfBase64, "base64");
    return new Response(pdf, {
      status: 200,
      headers: {
        "cache-control": "no-store, private",
        "content-disposition": `attachment; filename="resume-${input.template}-r${input.revision}.pdf"`,
        "content-length": String(pdf.byteLength),
        "content-type": "application/pdf",
        "x-artifact-sha256": audited.data.sha256,
        "x-capability-trace": audited.sourceVersion,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
