import { analyzeParsedResume, DEMO_RESUME_AST } from "@/lib/server/analysis";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { toRenderableResume } from "@/lib/server/export";
import { jsonResponse, routeErrorResponse } from "@/lib/server/http";
import { parsePdf } from "@/lib/server/pdf";
import { renderResumePdf } from "@/lib/server/typst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function buildDemo(signal?: AbortSignal) {
  const pdf = await renderResumePdf(toRenderableResume(DEMO_RESUME_AST), "professional");
  const parsed = await parsePdf(new Uint8Array(pdf), "简历分析助手-产品经理示例.pdf");
  return analyzeParsedResume(parsed, {
    ast: DEMO_RESUME_AST,
    resumeId: "demo-product-manager-v1",
    signal,
    originalPdfBase64: pdf.toString("base64"),
  });
}

export async function GET(request: Request) {
  try {
    await enforceAiRateLimit(request, "analysis");
    return jsonResponse(await buildDemo(request.signal));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
