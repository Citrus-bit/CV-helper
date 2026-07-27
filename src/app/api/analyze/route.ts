import { invokeBaselineCapability } from "@/lib/baseline";
import {
  analyzeParsedResume,
  createCapabilityContext,
} from "@/lib/server/analysis";
import {
  jsonResponse,
  parseFormDataBodyLimited,
  RequestInputError,
  routeErrorResponse,
} from "@/lib/server/http";
import {
  canFallbackFromDocumentWorker,
  parseWithDocumentWorker,
} from "@/lib/server/document-worker";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { selectOcrBlocksForPage } from "@/lib/server/ocr-merge";
import {
  MAX_PDF_BYTES,
  type ParsedPdfResult,
  type ParsedSourceBlock,
} from "@/lib/server/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTIPART_BYTES = MAX_PDF_BYTES + 512 * 1_024;
const DOCUMENT_WORKER_FALLBACK_WARNING =
  "隔离文档服务暂时不可用，已切换到本机基线解析。";

export async function POST(request: Request) {
  try {
    const startedAt = performance.now();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      throw new RequestInputError("PDF 超过 10 MB，请压缩后重试。", 413);
    }
    const form = await parseFormDataBodyLimited(request, MAX_MULTIPART_BYTES);
    const value = form.get("file");
    if (!(value instanceof File))
      throw new RequestInputError("请选择一份 PDF 简历。");
    if (
      value.type &&
      value.type !== "application/pdf" &&
      !value.name.toLowerCase().endsWith(".pdf")
    ) {
      throw new RequestInputError("只支持 PDF 文件。");
    }
    if (value.size > MAX_PDF_BYTES) {
      throw new RequestInputError("PDF 超过 10 MB，请压缩后重试。", 413);
    }
    await enforceAiRateLimit(request, "analysis");
    const bytes = new Uint8Array(await value.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES) {
      throw new RequestInputError("PDF 超过 10 MB，请压缩后重试。", 413);
    }
    // PDF.js may transfer and detach the input buffer, so preserve the original before parsing.
    const originalPdfBase64 = Buffer.from(bytes).toString("base64");
    let isolatedParse: Awaited<ReturnType<typeof parseWithDocumentWorker>> =
      null;
    let workerFallbackWarning: string | null = null;
    try {
      isolatedParse = await parseWithDocumentWorker({
        bytes,
        fileName: value.name || "resume.pdf",
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal.aborted || !canFallbackFromDocumentWorker(error))
        throw error;
      workerFallbackWarning = DOCUMENT_WORKER_FALLBACK_WARNING;
    }
    const baselineParse = isolatedParse
      ? null
      : await invokeBaselineCapability(
          "document.parse",
          {
            pdfBase64: originalPdfBase64,
            fileName: value.name || "resume.pdf",
          },
          createCapabilityContext("mixed", ["original_pdf"], request.signal),
        );
    const parseResult = isolatedParse ?? {
      ...baselineParse!,
      data: {
        ...baselineParse!.data,
        warnings: workerFallbackWarning
          ? [...baselineParse!.data.warnings, workerFallbackWarning]
          : baselineParse!.data.warnings,
      },
      warnings: workerFallbackWarning
        ? [
            ...baselineParse!.warnings,
            {
              code: "DOCUMENT_WORKER_FALLBACK",
              message: workerFallbackWarning,
            },
          ]
        : baselineParse!.warnings,
    };
    const documentVersions: Record<string, string> = {
      "document.parse": parseResult.sourceVersion,
    };
    const combinedBlocks = [...parseResult.data.blocks];
    const ocrConfidence = new Map<number, number>();
    const ocrWarnings: string[] = [];
    const ocrContext = createCapabilityContext(
      "mixed",
      ["page_image"],
      request.signal,
      180_000,
    );
    for (const page of parseResult.data.pages.filter(
      (candidate) =>
        !isolatedParse &&
        (candidate.source === "scan" || candidate.source === "mixed"),
    )) {
      try {
        const ocrResult = await invokeBaselineCapability(
          "document.ocr",
          {
            imageBase64: page.previewBase64,
            mimeType: page.previewMimeType,
            width: page.previewWidth ?? page.width,
            height: page.previewHeight ?? page.height,
            pageIndex: page.pageIndex,
            language: "chi_sim+eng",
          },
          ocrContext,
        );
        documentVersions["document.ocr"] = ocrResult.sourceVersion;
        const nativePageBlocks = parseResult.data.blocks.filter(
          (block) =>
            block.pageIndex === page.pageIndex && block.source === "native",
        );
        combinedBlocks.push(
          ...selectOcrBlocksForPage(
            page.source,
            nativePageBlocks,
            ocrResult.data.blocks,
          ),
        );
        ocrConfidence.set(page.pageIndex, ocrResult.data.confidence);
        ocrWarnings.push(
          ...ocrResult.warnings.map((warning) => warning.message),
        );
      } catch {
        ocrWarnings.push(
          `第 ${page.pageIndex + 1} 页 OCR 暂时不可用，原始页面仍可预览。`,
        );
      }
    }
    const sourceBlockContext = createCapabilityContext(
      "mixed",
      ["source_blocks"],
      request.signal,
    );
    const segmentResult = await invokeBaselineCapability(
      "document.segment",
      { blocks: combinedBlocks },
      sourceBlockContext,
    );
    documentVersions["document.segment"] = segmentResult.sourceVersion;
    const parsedBlocks: ParsedSourceBlock[] = segmentResult.data.blocks.map(
      (block) => ({
        id: block.id,
        pageIndex: block.pageIndex,
        order: block.order,
        text: block.text,
        source: block.source === "native" ? "pdf" : "ocr",
        confidence: block.confidence,
        bbox: block.bbox,
        role: block.role,
        style: block.style,
      }),
    );
    const hadNative = parsedBlocks.some(
      (block) => block.source === "pdf" && block.text.trim(),
    );
    const hadOcr = parsedBlocks.some(
      (block) => block.source === "ocr" && block.text.trim(),
    );
    const parsed: ParsedPdfResult = {
      fileName: parseResult.data.fileName,
      pageCount: parseResult.data.pageCount,
      text: parsedBlocks
        .slice()
        .sort(
          (left, right) =>
            left.pageIndex - right.pageIndex || left.order - right.order,
        )
        .map((block) => block.text)
        .join("\n")
        .trim(),
      blocks: parsedBlocks,
      pages: parseResult.data.pages.map((page) => ({
        pageIndex: page.pageIndex,
        width: page.width,
        height: page.height,
        previewWidth: page.previewWidth ?? page.width,
        previewHeight: page.previewHeight ?? page.height,
        source: page.source,
        nativeCharacterCount: page.nativeCharacterCount,
        ocrConfidence: ocrConfidence.get(page.pageIndex),
        previewDataUrl: `data:${page.previewMimeType};base64,${page.previewBase64}`,
      })),
      warnings: [...parseResult.data.warnings, ...ocrWarnings],
      extractionMode:
        hadNative && hadOcr ? "hybrid" : hadOcr ? "ocr" : "native",
    };
    const result = await analyzeParsedResume(parsed, {
      signal: request.signal,
      originalPdfBase64,
      documentCapabilityVersions: documentVersions,
      requireAi: true,
    });
    result.processing.durationMs = performance.now() - startedAt;
    return jsonResponse(result);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
