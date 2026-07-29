import {
  ExportQualityReportSchema,
  type AuditCheck,
  type ExportQualityReport,
  type ResumeAST,
} from "@/lib/domain";
import {
  exportBlockingCheckIds,
  normalizeExportCheckSeverity,
  onePagePreferenceCheck,
  qualityThresholdCheck,
} from "@/lib/export-quality";
import {
  type RenderableResume,
  type ResumeTemplateId,
} from "@/lib/server/typst";
import {
  analyzeRgbaPixels,
  hasMeaningfulPageVisuals,
  type PdfVisualMetrics,
} from "@/lib/pdf-visual-audit";
import { normalizeResumeTextForExport } from "@/lib/resume-text-safety";
import { createCanvas } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { loadPdfJs } from "@/lib/server/pdfjs";

type RenderAuditMeta = {
  resumeId: string;
  revision: number;
  template: ResumeTemplateId;
  sourcePageCount?: number;
};

type TextRectangle = {
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
};

type PageVisualAudit = {
  pageIndex: number;
  metrics: PdfVisualMetrics;
  textCharacters: number;
  visibleTextCharacters: number;
};

export type RenderAuditOptions = {
  signal?: AbortSignal;
  deadlineAt?: string | number;
  timeoutMs?: number;
};

const MAX_AUDIT_PDF_BYTES = 12 * 1_024 * 1_024;
const MAX_AUDIT_PAGES = 5;
const MAX_AUDIT_TEXT_ITEMS = 5_000;
const MAX_AUDIT_TEXT_CHARACTERS = 250_000;
const MAX_AUDIT_OPERATIONS = 100_000;
const MAX_VISUAL_AUDIT_PAGE_EDGE_POINTS = 2_000;
const MAX_VISUAL_AUDIT_PAGE_PIXELS = 1_500_000;
const MAX_VISUAL_AUDIT_TOTAL_RENDER_PIXELS = 16_000_000;
const MAX_TEXT_REGION_PIXEL_SAMPLES = 8_000_000;
const MAX_OVERLAP_COMPARISONS = 250_000;
const DEFAULT_AUDIT_TIMEOUT_MS = 12_000;
const MINIMUM_VISIBLE_TEXT_RATIO = 0.8;
const MINIMUM_TEXT_CONTRIBUTION_RATIO = 0.65;
const MINIMUM_TEXT_EDGE_RATIO = 0.03;
const MINIMUM_LOCAL_TEXT_CONTRIBUTION_RATIO = 0.4;
const MINIMUM_MASK_PIXELS_PER_TEXT_BAND = 8;
const MINIMUM_MASK_PIXELS_PER_TEXT_WINDOW = 4;
const MAX_TEXT_VISIBILITY_BANDS_PER_ITEM = 16;
const TEXT_DESCENDER_HEIGHT_RATIO = 0.22;

type AuditBudget = {
  textItems: number;
  textCharacters: number;
  operations: number;
  renderPixels: number;
  textRegionPixelSamples: number;
  overlapComparisons: number;
};

function auditAbortError(signal: AbortSignal) {
  const reason = signal.reason;
  if (reason instanceof Error && reason.message === "PDF_AUDIT_TIMEOUT") {
    return new Error("PDF 视觉质检超过处理时限。");
  }
  return new Error("PDF 视觉质检已取消。");
}

function throwIfAuditAborted(signal: AbortSignal) {
  if (signal.aborted) throw auditAbortError(signal);
}

async function awaitWithAuditSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  throwIfAuditAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(auditAbortError(signal));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function pixelLuminance(data: ArrayLike<number>, offset: number) {
  return (
    Number(data[offset]) * 0.2126 +
    Number(data[offset + 1]) * 0.7152 +
    Number(data[offset + 2]) * 0.0722
  );
}

function textRenderIsVisible(
  fullPixels: Uint8ClampedArray,
  backgroundPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number },
  expectedCharacters: number,
  budget: AuditBudget,
  ensureActive: () => void,
) {
  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const right = Math.min(width, Math.ceil(region.x + region.width));
  const bottom = Math.min(height, Math.ceil(region.y + region.height));
  const samples = Math.max(0, right - left) * Math.max(0, bottom - top);
  budget.textRegionPixelSamples += samples;
  if (budget.textRegionPixelSamples > MAX_TEXT_REGION_PIXEL_SAMPLES) {
    throw new Error("PDF 文字区域像素采样量超出质检限制。");
  }

  let maskPixelsCount = 0;
  let contributingPixels = 0;
  let edgePixels = 0;
  let scannedPixels = 0;
  const columnMaskPixels = new Uint32Array(Math.max(0, right - left));
  const columnContributingPixels = new Uint32Array(Math.max(0, right - left));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      scannedPixels += 1;
      if ((scannedPixels & 0xffff) === 0) ensureActive();
      const offset = (y * width + x) * 4;
      if (255 - pixelLuminance(maskPixels, offset) < 18) continue;
      maskPixelsCount += 1;
      columnMaskPixels[x - left] += 1;
      const delta =
        Math.abs(
          Number(fullPixels[offset]) - Number(backgroundPixels[offset]),
        ) +
        Math.abs(
          Number(fullPixels[offset + 1]) - Number(backgroundPixels[offset + 1]),
        ) +
        Math.abs(
          Number(fullPixels[offset + 2]) - Number(backgroundPixels[offset + 2]),
        );
      if (delta < 36) continue;
      contributingPixels += 1;
      columnContributingPixels[x - left] += 1;

      const luminance = pixelLuminance(fullPixels, offset);
      const neighbors = [
        [x - 2, y],
        [x + 2, y],
        [x, y - 2],
        [x, y + 2],
      ];
      if (
        neighbors.some(([neighborX, neighborY]) => {
          if (
            neighborX < 0 ||
            neighborX >= width ||
            neighborY < 0 ||
            neighborY >= height
          ) {
            return false;
          }
          return (
            Math.abs(
              luminance -
                pixelLuminance(fullPixels, (neighborY * width + neighborX) * 4),
            ) >= 18
          );
        })
      ) {
        edgePixels += 1;
      }
    }
  }

  if (maskPixelsCount === 0) return false;
  const globallyVisible =
    contributingPixels / maskPixelsCount >= MINIMUM_TEXT_CONTRIBUTION_RATIO &&
    edgePixels / maskPixelsCount >= MINIMUM_TEXT_EDGE_RATIO;
  if (!globallyVisible) return false;

  // Split only actual glyph ink, not the rectangle's whitespace, into bounded
  // reading-axis bands. This prevents visible prefixes from hiding a covered
  // suffix or middle glyph while tolerating proportional fonts and CJK gaps.
  const bandCount = Math.min(
    MAX_TEXT_VISIBILITY_BANDS_PER_ITEM,
    Math.max(1, expectedCharacters),
    Math.max(
      1,
      Math.floor(maskPixelsCount / MINIMUM_MASK_PIXELS_PER_TEXT_BAND),
    ),
  );
  if (bandCount === 1) return true;

  const targetInkPerBand = maskPixelsCount / bandCount;
  const bands: Array<{ mask: number; contributing: number }> = [];
  let bandMask = 0;
  let bandContributing = 0;
  for (let column = 0; column < columnMaskPixels.length; column += 1) {
    if (columnMaskPixels[column] === 0) continue;
    bandMask += columnMaskPixels[column];
    bandContributing += columnContributingPixels[column];
    if (bands.length < bandCount - 1 && bandMask >= targetInkPerBand) {
      bands.push({ mask: bandMask, contributing: bandContributing });
      bandMask = 0;
      bandContributing = 0;
    }
  }
  if (bandMask > 0) {
    bands.push({ mask: bandMask, contributing: bandContributing });
  }

  const bandsAreVisible = bands.every(
    (band) =>
      band.mask < MINIMUM_MASK_PIXELS_PER_TEXT_BAND ||
      band.contributing / band.mask >= MINIMUM_LOCAL_TEXT_CONTRIBUTION_RATIO,
  );
  if (!bandsAreVisible) return false;

  const averageCharacterWidth =
    columnMaskPixels.length / Math.max(1, expectedCharacters);
  const windowWidth = Math.max(2, Math.ceil(averageCharacterWidth * 0.75));
  const windowStep = Math.max(1, Math.floor(windowWidth / 2));
  const maskPrefix = new Uint32Array(columnMaskPixels.length + 1);
  const contributingPrefix = new Uint32Array(
    columnContributingPixels.length + 1,
  );
  for (let column = 0; column < columnMaskPixels.length; column += 1) {
    maskPrefix[column + 1] = maskPrefix[column] + columnMaskPixels[column];
    contributingPrefix[column + 1] =
      contributingPrefix[column] + columnContributingPixels[column];
  }

  const lastWindowStart = Math.max(0, columnMaskPixels.length - windowWidth);
  const windowStarts = new Set<number>();
  for (let start = 0; start <= lastWindowStart; start += windowStep) {
    windowStarts.add(start);
  }
  windowStarts.add(lastWindowStart);
  for (const start of windowStarts) {
    const end = Math.min(columnMaskPixels.length, start + windowWidth);
    const windowMask = maskPrefix[end] - maskPrefix[start];
    if (windowMask < MINIMUM_MASK_PIXELS_PER_TEXT_WINDOW) continue;
    const windowContributing =
      contributingPrefix[end] - contributingPrefix[start];
    if (
      windowContributing / windowMask <
      MINIMUM_LOCAL_TEXT_CONTRIBUTION_RATIO
    ) {
      return false;
    }
  }
  return true;
}

function compact(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s|｜·•●▪■,，.。:：;；()（）[\]{}<>《》/_\\\-]+/g, "");
}

function characterCount(text: string, character: string) {
  return Array.from(text).filter((value) => value === character).length;
}

function entryDate(startDate?: string, endDate?: string, current?: boolean) {
  if (!startDate && !endDate) return "";
  return [startDate, endDate ?? (current ? "至今" : undefined)]
    .filter(Boolean)
    .join(" - ");
}

function exportText(value?: string) {
  return value ? normalizeResumeTextForExport(value) : "";
}

export function toRenderableResume(ast: ResumeAST): RenderableResume {
  const links = ast.contact.links
    .map((link) => [exportText(link.label), exportText(link.url)] as const)
    .filter(([, url]) => Boolean(url))
    .map(([label, url]) => (label ? `${label}: ${url}` : url));
  const locationAndLinks = [exportText(ast.contact.location), ...links]
    .filter(Boolean)
    .join(" | ");
  const summaries = [
    ...new Set(
      [
        ast.summary,
        ...ast.sections
          .filter((section) => section.type === "summary")
          .map((section) => section.text),
      ]
        .map(exportText)
        .filter(Boolean),
    ),
  ];
  return {
    profile: {
      name: exportText(ast.contact.name),
      headline: exportText(ast.contact.headline) || undefined,
      email: exportText(ast.contact.email) || undefined,
      phone: exportText(ast.contact.phone) || undefined,
      location: locationAndLinks || undefined,
      summary: summaries.join("\n") || undefined,
    },
    sections: ast.sections
      .map((section) => ({
        title: exportText(section.title),
        items: [
          ...(section.type !== "summary" && exportText(section.text)
            ? [{ title: "", bullets: [exportText(section.text)] }]
            : []),
          ...section.entries.map((entry) => ({
            title: exportText(entry.title),
            subtitle:
              [entry.organization, entry.subtitle, entry.location]
                .map(exportText)
                .filter(Boolean)
                .join(" · ") || undefined,
            date:
              exportText(
                entryDate(entry.startDate, entry.endDate, entry.current),
              ) ||
              undefined,
            bullets: [entry.summary, ...entry.bullets]
              .map(exportText)
              .filter(Boolean),
          })),
        ],
      }))
      .filter((section) => section.items.length > 0),
  };
}

export function astContentFragments(ast: ResumeAST) {
  return [
    ast.contact.name,
    ast.contact.headline,
    ast.contact.email,
    ast.contact.phone,
    ast.contact.location,
    ...ast.contact.links.flatMap((link) => [link.label, link.url]),
    ast.summary,
    ...ast.sections.flatMap((section) => [
      // The renderer intentionally drops empty structural sections. Requiring
      // their headings here would make every template fail the same hard gate.
      ...(section.type === "summary" ||
      (!exportText(section.text) && section.entries.length === 0)
        ? []
        : [section.title]),
      section.text,
      ...section.entries.flatMap((entry) => [
        entry.title,
        entry.subtitle,
        entry.organization,
        entry.location,
        entry.startDate,
        entry.endDate,
        entry.summary,
        ...entry.bullets,
      ]),
    ]),
  ]
    .map(exportText)
    .filter(Boolean);
}

function expectedFragments(resume: RenderableResume) {
  return [
    resume.profile.name,
    resume.profile.headline,
    resume.profile.email,
    resume.profile.phone,
    resume.profile.location,
    resume.profile.summary,
    ...resume.sections.flatMap((section) => [
      section.title,
      ...section.items.flatMap((item) => [
        item.title,
        item.subtitle,
        item.date,
        ...item.bullets,
      ]),
    ]),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function overlapRatio(left: TextRectangle, right: TextRectangle) {
  const overlapWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) -
      Math.max(left.y, right.y),
  );
  const intersection = overlapWidth * overlapHeight;
  return (
    intersection /
    Math.max(1, Math.min(left.width * left.height, right.width * right.height))
  );
}

function check(
  id: string,
  label: string,
  status: AuditCheck["status"],
  details?: string,
): AuditCheck {
  return { id, label, status, details };
}

export async function auditRenderedPdf(
  pdf: Uint8Array,
  expectedResume: RenderableResume,
  meta: RenderAuditMeta,
  sourceFragments: string[] = expectedFragments(expectedResume),
  options: RenderAuditOptions = {},
): Promise<ExportQualityReport> {
  const validHeader =
    pdf.byteLength >= 800 &&
    new TextDecoder("ascii").decode(pdf.slice(0, 5)) === "%PDF-";
  if (!validHeader) throw new Error("Typst 未生成可读的 PDF。");
  if (pdf.byteLength > MAX_AUDIT_PDF_BYTES) {
    throw new Error("PDF 超出 12 MB 导出质检限制。");
  }
  const expected = [
    ...new Set([...expectedFragments(expectedResume), ...sourceFragments]),
  ];
  if (expected.length > MAX_AUDIT_TEXT_ITEMS) {
    throw new Error("结构化简历片段数超出导出质检限制。");
  }
  if (
    expected.reduce((total, fragment) => total + fragment.length, 0) >
    MAX_AUDIT_TEXT_CHARACTERS
  ) {
    throw new Error("结构化简历字符数超出导出质检限制。");
  }

  const controller = new AbortController();
  const abortFromParent = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromParent();
  else
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
  const explicitDeadline =
    typeof options.deadlineAt === "string"
      ? Date.parse(options.deadlineAt)
      : options.deadlineAt;
  const timeoutDeadline =
    Date.now() + Math.max(1, options.timeoutMs ?? DEFAULT_AUDIT_TIMEOUT_MS);
  const deadline = Number.isFinite(explicitDeadline)
    ? Math.min(timeoutDeadline, Number(explicitDeadline))
    : timeoutDeadline;
  const timeout = setTimeout(
    () => controller.abort(new Error("PDF_AUDIT_TIMEOUT")),
    Math.max(1, deadline - Date.now()),
  );
  timeout.unref?.();
  const ensureAuditActive = () => {
    if (Date.now() >= deadline && !controller.signal.aborted) {
      controller.abort(new Error("PDF_AUDIT_TIMEOUT"));
    }
    throwIfAuditAborted(controller.signal);
  };
  const budget: AuditBudget = {
    textItems: 0,
    textCharacters: 0,
    operations: 0,
    renderPixels: 0,
    textRegionPixelSamples: 0,
    overlapComparisons: 0,
  };

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    verbosity: 0,
  });
  try {
    const rectangles: TextRectangle[] = [];
    const pageTexts: string[] = [];
    const visiblePageTexts: string[] = [];
    const pageVisualAudits: PageVisualAudit[] = [];
    let pageCount = 0;
    try {
      const document = await awaitWithAuditSignal(
        loadingTask.promise,
        controller.signal,
      );
      pageCount = document.numPages;
      if (pageCount < 1 || pageCount > MAX_AUDIT_PAGES) {
        throw new Error("PDF 页数必须在 1 至 5 页之间。");
      }

      const textPaintOperations = new Set([
        pdfjs.OPS.showText,
        pdfjs.OPS.showSpacedText,
        pdfjs.OPS.nextLineShowText,
        pdfjs.OPS.nextLineSetSpacingShowText,
      ]);
      const nonTextPaintOperations = new Set([
        pdfjs.OPS.stroke,
        pdfjs.OPS.closeStroke,
        pdfjs.OPS.fill,
        pdfjs.OPS.eoFill,
        pdfjs.OPS.fillStroke,
        pdfjs.OPS.eoFillStroke,
        pdfjs.OPS.closeFillStroke,
        pdfjs.OPS.closeEOFillStroke,
        pdfjs.OPS.shadingFill,
        pdfjs.OPS.paintXObject,
        pdfjs.OPS.paintImageMaskXObject,
        pdfjs.OPS.paintImageMaskXObjectGroup,
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintInlineImageXObjectGroup,
        pdfjs.OPS.paintImageXObjectRepeat,
        pdfjs.OPS.paintImageMaskXObjectRepeat,
        pdfjs.OPS.paintSolidColorImageMask,
        pdfjs.OPS.constructPath,
        pdfjs.OPS.rawFillPath,
      ]);
      const textMaskStateOperations = new Set([
        pdfjs.OPS.setGState,
        pdfjs.OPS.setTextRenderingMode,
        pdfjs.OPS.setStrokeColorSpace,
        pdfjs.OPS.setFillColorSpace,
        pdfjs.OPS.setStrokeColor,
        pdfjs.OPS.setStrokeColorN,
        pdfjs.OPS.setFillColor,
        pdfjs.OPS.setFillColorN,
        pdfjs.OPS.setStrokeGray,
        pdfjs.OPS.setFillGray,
        pdfjs.OPS.setStrokeRGBColor,
        pdfjs.OPS.setFillRGBColor,
        pdfjs.OPS.setStrokeCMYKColor,
        pdfjs.OPS.setFillCMYKColor,
        pdfjs.OPS.setStrokeTransparent,
        pdfjs.OPS.setFillTransparent,
      ]);

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        ensureAuditActive();
        const page = await awaitWithAuditSignal(
          document.getPage(pageNumber),
          controller.signal,
        );
        try {
          const viewport = page.getViewport({ scale: 1 });
          if (
            viewport.width > MAX_VISUAL_AUDIT_PAGE_EDGE_POINTS ||
            viewport.height > MAX_VISUAL_AUDIT_PAGE_EDGE_POINTS
          ) {
            throw new Error("PDF 页面尺寸超出视觉质检限制。");
          }
          const [content, operatorList] = await Promise.all([
            awaitWithAuditSignal(page.getTextContent(), controller.signal),
            awaitWithAuditSignal(page.getOperatorList(), controller.signal),
          ]);
          budget.operations += operatorList.fnArray.length;
          if (budget.operations > MAX_AUDIT_OPERATIONS) {
            throw new Error("PDF 绘制操作数超出质检限制。");
          }

          const pageText: string[] = [];
          const pageRectangles: TextRectangle[] = [];
          for (const item of content.items) {
            if (!("str" in item) || !item.str.trim()) continue;
            budget.textItems += 1;
            budget.textCharacters += item.str.length;
            if (budget.textItems > MAX_AUDIT_TEXT_ITEMS) {
              throw new Error("PDF 文字对象数超出质检限制。");
            }
            if (budget.textCharacters > MAX_AUDIT_TEXT_CHARACTERS) {
              throw new Error("PDF 文字层字符数超出质检限制。");
            }
            pageText.push(item.str);
            const height = Math.max(
              1,
              item.height ?? Math.abs(item.transform[3] ?? 0),
            );
            const rectangle = {
              pageIndex: pageNumber - 1,
              text: item.str,
              x: item.transform[4],
              y: item.transform[5] - height * TEXT_DESCENDER_HEIGHT_RATIO,
              width: Math.max(1, item.width ?? 1),
              height,
              pageWidth: viewport.width,
              pageHeight: viewport.height,
            };
            rectangles.push(rectangle);
            pageRectangles.push(rectangle);
          }
          pageTexts.push(pageText.join(" "));

          const visualScale = Math.min(
            1.4,
            1_100 / viewport.width,
            1_500 / viewport.height,
          );
          const visualViewport = page.getViewport({ scale: visualScale });
          const pixelWidth = Math.max(1, Math.ceil(visualViewport.width));
          const pixelHeight = Math.max(1, Math.ceil(visualViewport.height));
          const pagePixels = pixelWidth * pixelHeight;
          if (pagePixels > MAX_VISUAL_AUDIT_PAGE_PIXELS) {
            throw new Error("PDF 页面像素量超出视觉质检限制。");
          }
          budget.renderPixels += pagePixels * 3;
          if (budget.renderPixels > MAX_VISUAL_AUDIT_TOTAL_RENDER_PIXELS) {
            throw new Error("PDF 总渲染像素量超出质检限制。");
          }

          const renderPixels = async (
            operationsFilter?: (index: number) => boolean,
            blackDefaultPaint = false,
          ) => {
            ensureAuditActive();
            const canvas = createCanvas(pixelWidth, pixelHeight);
            const context = canvas.getContext("2d");
            context.fillStyle = "rgb(255,255,255)";
            context.fillRect(0, 0, pixelWidth, pixelHeight);
            if (blackDefaultPaint) {
              context.fillStyle = "rgb(0,0,0)";
              context.strokeStyle = "rgb(0,0,0)";
            }
            const renderTask = page.render({
              canvas: canvas as never,
              canvasContext: context as never,
              viewport: visualViewport,
              background: "rgb(255,255,255)",
              operationsFilter,
            });
            const cancel = () => renderTask.cancel();
            controller.signal.addEventListener("abort", cancel, { once: true });
            try {
              await awaitWithAuditSignal(renderTask.promise, controller.signal);
              return context.getImageData(0, 0, pixelWidth, pixelHeight).data;
            } finally {
              controller.signal.removeEventListener("abort", cancel);
            }
          };

          const pixels = await renderPixels();
          // Compare full, text-free, and text-mask renders to prove glyphs are visible.
          const backgroundPixels = await renderPixels(
            (index) => !textPaintOperations.has(operatorList.fnArray[index]),
          );
          const maskPixels = await renderPixels(
            (index) =>
              !nonTextPaintOperations.has(operatorList.fnArray[index]) &&
              !textMaskStateOperations.has(operatorList.fnArray[index]),
            true,
          );
          let textCharacters = 0;
          let visibleTextCharacters = 0;
          const visiblePageText: string[] = [];
          for (const rectangle of pageRectangles) {
            ensureAuditActive();
            const characterCount = Math.max(1, compact(rectangle.text).length);
            textCharacters += characterCount;
            if (
              textRenderIsVisible(
                pixels,
                backgroundPixels,
                maskPixels,
                pixelWidth,
                pixelHeight,
                {
                  x: rectangle.x * visualScale,
                  y:
                    (rectangle.pageHeight - rectangle.y - rectangle.height) *
                    visualScale,
                  width: rectangle.width * visualScale,
                  height: rectangle.height * visualScale,
                },
                characterCount,
                budget,
                ensureAuditActive,
              )
            ) {
              visibleTextCharacters += characterCount;
              visiblePageText.push(rectangle.text);
            }
          }
          visiblePageTexts.push(visiblePageText.join(" "));
          pageVisualAudits.push({
            pageIndex: pageNumber - 1,
            metrics: analyzeRgbaPixels(pixels, pixelWidth, pixelHeight),
            textCharacters,
            visibleTextCharacters,
          });
        } finally {
          page.cleanup();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } finally {
      await loadingTask.destroy().catch(() => undefined);
    }

    const extractedText = pageTexts.join("\n");
    const extractedCompact = compact(extractedText);
    const visibleExtractedCompact = compact(visiblePageTexts.join("\n"));
    const missing = expected.filter((fragment) => {
      const needle = compact(fragment);
      return needle.length >= 2 && !extractedCompact.includes(needle);
    });
    const visuallyMissing = expected.filter((fragment) => {
      const needle = compact(fragment);
      return needle.length >= 2 && !visibleExtractedCompact.includes(needle);
    });
    const clipped = rectangles.filter(
      (rectangle) =>
        rectangle.x < -0.5 ||
        rectangle.y < -0.5 ||
        rectangle.x + rectangle.width > rectangle.pageWidth + 0.5 ||
        rectangle.y + rectangle.height > rectangle.pageHeight + 0.5,
    );
    let overlaps = 0;
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      ensureAuditActive();
      const pageRectangles = rectangles
        .filter((rectangle) => rectangle.pageIndex === pageIndex)
        .sort((a, b) => a.y - b.y);
      for (
        let leftIndex = 0;
        leftIndex < pageRectangles.length;
        leftIndex += 1
      ) {
        const left = pageRectangles[leftIndex];
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < pageRectangles.length;
          rightIndex += 1
        ) {
          const right = pageRectangles[rightIndex];
          // Y-order lets us stop once later text can no longer overlap this item.
          if (right.y > left.y + left.height) break;
          budget.overlapComparisons += 1;
          if ((budget.overlapComparisons & 0x3ff) === 0) ensureAuditActive();
          if (budget.overlapComparisons > MAX_OVERLAP_COMPARISONS) {
            throw new Error("PDF 文字重叠比较量超出质检限制。");
          }
          if (
            overlapRatio(left, right) > 0.35 &&
            compact(left.text) !== compact(right.text)
          )
            overlaps += 1;
        }
      }
    }
    const marginViolations = rectangles.filter(
      (rectangle) =>
        rectangle.x < 24 ||
        rectangle.x + rectangle.width > rectangle.pageWidth - 24,
    );
    const expectedText = sourceFragments.join("\n");
    const replacementCharacters = characterCount(extractedText, "\uFFFD");
    const unexpectedPlaceholderSquares = Math.max(
      0,
      characterCount(extractedText, "\u25A1") -
        characterCount(expectedText, "\u25A1"),
    );
    const missingGlyphs =
      replacementCharacters + unexpectedPlaceholderSquares;
    const artifactSha256 = createHash("sha256").update(pdf).digest("hex");
    const undersizedText = rectangles.filter(
      (rectangle) => rectangle.height < 7,
    );
    const sectionTitles = expectedResume.sections
      .map((section) => compact(section.title))
      .filter(Boolean);
    const orphanHeadings = pageTexts.filter((pageText) => {
      const pageCompact = compact(pageText);
      return sectionTitles.some((title) => pageCompact.endsWith(title));
    });
    const rawPdf = Buffer.from(pdf).toString("latin1");
    const hasEmbeddedFont = /\/FontFile(?:2|3)?\b/.test(rawPdf);
    const searchable =
      extractedCompact.length >=
      Math.min(20, compact(expectedResume.profile.name).length + 8);
    const pagesWithoutVisualContent = pageVisualAudits.filter(
      (audit) => !hasMeaningfulPageVisuals(audit.metrics),
    );
    const textCharacters = pageVisualAudits.reduce(
      (total, audit) => total + audit.textCharacters,
      0,
    );
    const visibleTextCharacters = pageVisualAudits.reduce(
      (total, audit) => total + audit.visibleTextCharacters,
      0,
    );
    const visibleTextRatio =
      textCharacters > 0 ? visibleTextCharacters / textCharacters : 0;
    const textVisuallyReadable =
      textCharacters > 0 &&
      visibleTextRatio >= MINIMUM_VISIBLE_TEXT_RATIO &&
      visuallyMissing.length === 0;

    const orderFragments = [
      ...new Set(expectedFragments(expectedResume).map(compact)),
    ].filter(
      (fragment) => fragment.length >= 3 && extractedCompact.includes(fragment),
    );
    let cursor = -1;
    let orderBreaks = 0;
    for (const fragment of orderFragments) {
      const index = extractedCompact.indexOf(fragment, Math.max(0, cursor));
      if (index < cursor) orderBreaks += 1;
      else cursor = index + fragment.length;
    }

    const checks: AuditCheck[] = [
      check(
        "valid-pdf",
        "PDF 结构",
        "pass",
        "文件头、页树、文本对象和页面画面均可正常读取。",
      ),
      check(
        "visual-content",
        "页面视觉内容",
        pagesWithoutVisualContent.length ? "fail" : "pass",
        pagesWithoutVisualContent.length
          ? `第 ${pagesWithoutVisualContent.map((audit) => audit.pageIndex + 1).join("、")} 页缺少足够的非白、高对比视觉内容。`
          : "逐页像素复核确认页面不是空白或纯色画布。",
      ),
      check(
        "text-visibility",
        "文字视觉可读性",
        textVisuallyReadable ? "pass" : "fail",
        textVisuallyReadable
          ? `渲染差分确认约 ${Math.round(visibleTextRatio * 100)}% 的文字层字符实际产生可见字形，全部预期内容均可见。`
          : `渲染差分确认约 ${Math.round(visibleTextRatio * 100)}% 的文字层字符实际产生可见字形，仍有 ${visuallyMissing.length} 处预期内容不可见。`,
      ),
      check(
        "searchable-text",
        "文本可搜索性",
        searchable ? "pass" : "fail",
        searchable ? "内容保留可搜索文字层。" : "PDF 缺少足够的可搜索文字。",
      ),
      check(
        "content-completeness",
        "内容完整性",
        missing.length ? "fail" : "pass",
        missing.length
          ? `有 ${missing.length} 处输入内容未在导出文字层中找到。`
          : "结构化简历内容均可在导出件中追溯。",
      ),
      check(
        "clipping",
        "边界与裁切",
        clipped.length ? "fail" : "pass",
        clipped.length
          ? `发现 ${clipped.length} 个文本对象超出页面边界。`
          : "未发现越界文本。",
      ),
      check(
        "overlap",
        "元素重叠",
        overlaps ? "fail" : "pass",
        overlaps
          ? `发现 ${overlaps} 组高度重叠的文本对象。`
          : "未发现显著文本重叠。",
      ),
      check(
        "margins",
        "页边距",
        marginViolations.length ? "fail" : "pass",
        marginViolations.length
          ? `有 ${marginViolations.length} 个文本对象进入 24pt 安全边界。`
          : "左右安全边界保留完整。",
      ),
      onePagePreferenceCheck(pageCount),
      check(
        "revision-reference",
        "内容检查基准",
        "pass",
        `仅以当前最新版本 r${meta.revision} 的结构化内容检查本 PDF；原版和历史版本不参与自动质量判定。`,
      ),
      check(
        "font-size",
        "最小文字尺寸",
        undersizedText.length ? "fail" : "pass",
        undersizedText.length
          ? `发现 ${undersizedText.length} 个文字对象低于 7pt 可读阈值。`
          : "未通过缩小到 7pt 以下强压内容。",
      ),
      check(
        "line-spacing",
        "行距可读性",
        overlaps ? "fail" : "pass",
        overlaps ? "文本行距产生可见碰撞。" : "文本行之间未出现碰撞。",
      ),
      check(
        "orphan-heading",
        "标题分页",
        orphanHeadings.length ? "fail" : "pass",
        orphanHeadings.length
          ? `发现 ${orphanHeadings.length} 个章节标题落在页末且无后续内容。`
          : "未发现页末孤立章节标题。",
      ),
      check(
        "missing-glyphs",
        "字形完整性",
        missingGlyphs ? "fail" : "pass",
        missingGlyphs
          ? `文字层中发现 ${missingGlyphs} 个非原文的缺失字形标记。`
          : "未发现导出过程新增的替代字符或空方框。",
      ),
      check(
        "font-embedding",
        "字体嵌入",
        hasEmbeddedFont ? "pass" : "fail",
        hasEmbeddedFont ? "PDF 包含嵌入字体程序。" : "未检测到嵌入字体。",
      ),
      check(
        "ats-order",
        "ATS 阅读顺序",
        orderBreaks ? "fail" : "pass",
        orderBreaks
          ? `发现 ${orderBreaks} 处文本顺序可能需要人工复核。`
          : "关键内容按结构化顺序输出。",
      ),
    ];
    const overallScore = Math.max(
      0,
      100 -
        checks.reduce(
          (total, item) =>
            total +
            (item.status === "fail" ? 22 : item.status === "warn" ? 5 : 0),
          0,
        ),
    );
    const normalizedChecks = checks.map(normalizeExportCheckSeverity);
    normalizedChecks.push(qualityThresholdCheck(overallScore));
    const blockingCheckIds = exportBlockingCheckIds(normalizedChecks);
    const hardGate = {
      passed: blockingCheckIds.length === 0,
      blockingCheckIds,
    };
    return ExportQualityReportSchema.parse({
      resumeId: meta.resumeId,
      resumeRevision: meta.revision,
      template: meta.template,
      artifactSha256,
      sourcePageCount: meta.sourcePageCount,
      pageCount,
      downloadable: hardGate.passed,
      searchableText: searchable,
      contentComplete: missing.length === 0,
      hardGate,
      overallScore,
      checks: normalizedChecks,
      generatedAt: new Date().toISOString(),
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}
