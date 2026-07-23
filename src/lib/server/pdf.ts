import { createCanvas } from "@napi-rs/canvas";

import { getOfflineTesseractOptions } from "@/lib/server/ocr";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 5;
export const MAX_PDF_PAGE_EDGE_POINTS = 2_000;
export const MAX_PDF_PREVIEW_PIXELS = 20_000_000;
export const MAX_PDF_CHARACTERS_PER_PAGE = 40_000;

export type ParsedPageSource = "digital" | "scan" | "mixed";

export type ParsedSourceBlock = {
  id: string;
  pageIndex: number;
  order: number;
  text: string;
  source: "pdf" | "ocr";
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
};

export type ParsedPdfPage = {
  pageIndex: number;
  width: number;
  height: number;
  previewWidth: number;
  previewHeight: number;
  source: ParsedPageSource;
  nativeCharacterCount: number;
  ocrConfidence?: number;
  previewDataUrl: string;
};

export type ParsedPdfResult = {
  fileName: string;
  pageCount: number;
  text: string;
  blocks: ParsedSourceBlock[];
  pages: ParsedPdfPage[];
  warnings: string[];
  extractionMode: "native" | "hybrid" | "ocr";
};

export class PdfInputError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_PDF"
      | "TOO_LARGE"
      | "TOO_MANY_PAGES"
      | "PAGE_TOO_LARGE"
      | "TOO_COMPLEX"
      | "ENCRYPTED"
      | "CORRUPT"
      | "EMPTY",
  ) {
    super(message);
    this.name = "PdfInputError";
  }
}

function assertPdfBytes(bytes: Uint8Array) {
  if (bytes.byteLength === 0) {
    throw new PdfInputError("文件为空，请重新选择 PDF。", "EMPTY");
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new PdfInputError("PDF 超过 10 MB，请压缩后重试。", "TOO_LARGE");
  }
  const magic = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (magic !== "%PDF-") {
    throw new PdfInputError("文件内容不是有效 PDF。", "NOT_PDF");
  }
}

function normalizeText(text: string) {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageKind(characterCount: number): ParsedPageSource {
  if (characterCount < 20) return "scan";
  if (characterCount < 100) return "mixed";
  return "digital";
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("PDF processing was cancelled.");
  error.name = "AbortError";
  throw error;
}

async function renderPage(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs")["getDocument"]>["promise"]>["getPage"]>>,
  maxWidth = 1120,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, maxWidth / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const pixelWidth = Math.ceil(viewport.width);
  const pixelHeight = Math.ceil(viewport.height);
  if (
    !Number.isFinite(pixelWidth) ||
    !Number.isFinite(pixelHeight) ||
    pixelWidth <= 0 ||
    pixelHeight <= 0 ||
    pixelWidth * pixelHeight > MAX_PDF_PREVIEW_PIXELS
  ) {
    throw new PdfInputError("PDF 页面渲染尺寸超出安全限制。", "TOO_COMPLEX");
  }
  const canvas = createCanvas(pixelWidth, pixelHeight);
  const context = canvas.getContext("2d");
  const renderTask = page.render({
    canvas: canvas as never,
    canvasContext: context as never,
    viewport,
  });
  const cancel = () => renderTask.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await renderTask.promise;
    throwIfAborted(signal);
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  return {
    dataUrl: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`,
    width: canvas.width,
    height: canvas.height,
  };
}

async function runOcr(previewDataUrl: string) {
  const { recognize } = await import("tesseract.js");
  const result = await recognize(previewDataUrl, "chi_sim+eng", getOfflineTesseractOptions());
  return {
    text: normalizeText(result.data.text),
    confidence: Math.max(0, Math.min(1, result.data.confidence / 100)),
  };
}

export async function parsePdf(
  bytes: Uint8Array,
  fileName = "resume.pdf",
  options: { enableOcr?: boolean; signal?: AbortSignal } = {},
): Promise<ParsedPdfResult> {
  throwIfAborted(options.signal);
  assertPdfBytes(bytes);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let document: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  let loadingTask: ReturnType<typeof pdfjs.getDocument>;

  try {
    loadingTask = pdfjs.getDocument({
      data: bytes,
      useSystemFonts: true,
      verbosity: 0,
    });
    const cancelLoading = () => void loadingTask.destroy();
    options.signal?.addEventListener("abort", cancelLoading, { once: true });
    document = await loadingTask.promise;
    options.signal?.removeEventListener("abort", cancelLoading);
    throwIfAborted(options.signal);
  } catch (error) {
    if (options.signal?.aborted) throwIfAborted(options.signal);
    const message = error instanceof Error ? error.message : String(error);
    if (/password/i.test(message)) {
      throw new PdfInputError("暂不支持加密或设置密码的 PDF。", "ENCRYPTED");
    }
    throw new PdfInputError("PDF 已损坏或包含不支持的结构。", "CORRUPT");
  }

  if (document.numPages > MAX_PDF_PAGES) {
    await loadingTask.destroy();
    throw new PdfInputError("MVP 最多支持 5 页简历。", "TOO_MANY_PAGES");
  }

  const warnings: string[] = [];
  const blocks: ParsedSourceBlock[] = [];
  const pages: ParsedPdfPage[] = [];
  let hadNative = false;
  let hadOcr = false;

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      throwIfAborted(options.signal);
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      if (
        !Number.isFinite(viewport.width) ||
        !Number.isFinite(viewport.height) ||
        viewport.width <= 0 ||
        viewport.height <= 0 ||
        Math.max(viewport.width, viewport.height) > MAX_PDF_PAGE_EDGE_POINTS
      ) {
        throw new PdfInputError(`第 ${pageNumber} 页尺寸超出安全限制。`, "PAGE_TOO_LARGE");
      }
      const textContent = await page.getTextContent();
      let order = 0;
      let nativeCharacters = 0;

      for (const item of textContent.items) {
        if (!("str" in item)) continue;
        const text = normalizeText(item.str);
        if (!text) continue;
        if (nativeCharacters + text.length > MAX_PDF_CHARACTERS_PER_PAGE) {
          warnings.push(`第 ${pageNumber} 页文字对象超过安全上限，已截断额外内容。`);
          break;
        }
        nativeCharacters += text.length;
        const transform = item.transform;
        const width = Math.max(0, item.width ?? 0);
        const height = Math.max(0, item.height ?? Math.abs(transform[3] ?? 0));
        blocks.push({
          id: `p${pageNumber}-b${order + 1}`,
          pageIndex: pageNumber - 1,
          order,
          text,
          source: "pdf",
          confidence: 1,
          bbox: {
            x: Math.max(0, transform[4] / viewport.width),
            y: Math.max(0, 1 - transform[5] / viewport.height),
            width: Math.min(1, width / viewport.width),
            height: Math.min(1, height / viewport.height),
          },
        });
        order += 1;
      }

      const pageBlocks = blocks.filter((block) => block.pageIndex === pageNumber - 1);
      const nativeText = pageBlocks.map((block) => block.text).join(" ");
      const nativeCharacterCount = nativeText.replace(/\s/g, "").length;
      const source = pageKind(nativeCharacterCount);
      const preview = await renderPage(page, 1120, options.signal);
      let ocrConfidence: number | undefined;

      if (nativeCharacterCount > 0) hadNative = true;
      if (source !== "digital") {
        warnings.push(
          source === "scan"
            ? `第 ${pageNumber} 页缺少可用文字层，已标记为扫描页。`
            : `第 ${pageNumber} 页文字层较少，已标记为混合页。`,
        );
      }

      if (options.enableOcr && source === "scan") {
        try {
          const ocr = await runOcr(preview.dataUrl);
          ocrConfidence = ocr.confidence;
          if (ocr.text) {
            hadOcr = true;
            blocks.push({
              id: `p${pageNumber}-ocr`,
              pageIndex: pageNumber - 1,
              order,
              text: ocr.text,
              source: "ocr",
              confidence: ocr.confidence,
              bbox: { x: 0, y: 0, width: 1, height: 1 },
            });
          } else {
            warnings.push(`第 ${pageNumber} 页 OCR 未识别出有效文本，请人工补充。`);
          }
        } catch {
          warnings.push(`第 ${pageNumber} 页 OCR 暂时不可用，原始页面仍可预览。`);
        }
      }

      pages.push({
        pageIndex: pageNumber - 1,
        width: viewport.width,
        height: viewport.height,
        previewWidth: preview.width,
        previewHeight: preview.height,
        source,
        nativeCharacterCount,
        ocrConfidence,
        previewDataUrl: preview.dataUrl,
      });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  const text = normalizeText(
    blocks
      .slice()
      .sort((a, b) => a.pageIndex - b.pageIndex || a.order - b.order)
      .map((block) => block.text)
      .join("\n"),
  );

  if (!text) {
    warnings.push("没有提取到文字。你仍可查看原页并手动补充内容。");
  }

  return {
    fileName,
    pageCount: pages.length,
    text,
    blocks,
    pages,
    warnings,
    extractionMode: hadNative && hadOcr ? "hybrid" : hadOcr ? "ocr" : "native",
  };
}
