import {
  analyzeRgbaPixels,
  hasMeaningfulPageVisuals,
} from "@/lib/pdf-visual-audit";

export type PdfFirstPageRenderResult = {
  pageCount: number;
  width: number;
  height: number;
};

let pdfJsPromise: Promise<
  typeof import("pdfjs-dist/legacy/build/pdf.mjs")
> | null = null;

function abortError() {
  return new DOMException("PDF preview rendering was cancelled.", "AbortError");
}

function loadPdfJs() {
  pdfJsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.mjs?v=${encodeURIComponent(pdfjs.version)}`;
    return pdfjs;
  });
  return pdfJsPromise;
}

export function decodePdfBase64(value: string) {
  const encoded = value.startsWith("data:")
    ? value.slice(value.indexOf(",") + 1)
    : value;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function canvasContainsRenderedPixels(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    return false;
  const pixels = context.getImageData(0, 0, width, height);
  return hasMeaningfulPageVisuals(
    analyzeRgbaPixels(pixels.data, width, height),
  );
}

export async function renderPdfFirstPage(
  pdfBase64: string,
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<PdfFirstPageRenderResult> {
  if (signal?.aborted) throw abortError();

  const pdfjs = await loadPdfJs();
  if (signal?.aborted) throw abortError();

  const loadingTask = pdfjs.getDocument({
    data: decodePdfBase64(pdfBase64),
    useSystemFonts: true,
    verbosity: 0,
  });
  let pdfDocument: Awaited<typeof loadingTask.promise> | null = null;
  let renderTask: ReturnType<
    Awaited<
      ReturnType<Awaited<typeof loadingTask.promise>["getPage"]>
    >["render"]
  > | null = null;
  let destroyPromise: Promise<void> | null = null;

  const destroy = () => {
    destroyPromise ??= loadingTask.destroy();
    return destroyPromise;
  };

  const cancel = () => {
    renderTask?.cancel();
    void destroy();
  };
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    pdfDocument = await loadingTask.promise;
    if (signal?.aborted) throw abortError();
    if (pdfDocument.numPages < 1) throw new Error("PDF 没有可预览的页面。");

    const page = await pdfDocument.getPage(1);
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法创建 PDF 预览画布。");

    context.save();
    context.fillStyle = "rgb(255,255,255)";
    context.fillRect(0, 0, width, height);
    context.restore();

    renderTask = page.render({
      canvas,
      viewport,
      background: "rgb(255,255,255)",
    });
    await renderTask.promise;
    if (signal?.aborted) throw abortError();
    if (!canvasContainsRenderedPixels(context, width, height)) {
      throw new Error("PDF 第一页缺少足够的可见内容或文字对比度。");
    }

    return {
      pageCount: pdfDocument.numPages,
      width: viewport.width / scale,
      height: viewport.height / scale,
    };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    await destroy();
  }
}
