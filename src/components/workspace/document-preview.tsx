"use client";

import {
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  FileText,
  Minus,
  Plus,
  Upload,
} from "lucide-react";
import {
  EstimatedProgressText,
  estimatedDurations,
} from "../estimated-progress";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  resolveSuggestionSourceBlocks,
  type BoundingBox,
  type SourceBlock,
} from "@/lib/domain";
import { pdfDataUrl } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import { ClientPdfPreview } from "./client-pdf-preview";
import { OriginalPdfPage } from "./original-pdf-page";

type HighlightRectangle = {
  id: string;
  pageIndex: number;
  bbox: BoundingBox;
};

function paddedHighlightBox(bbox: BoundingBox): BoundingBox {
  const minimumWidth = 0.008;
  const minimumHeight = 0.014;
  const width = Math.max(bbox.width, minimumWidth);
  const height = Math.max(bbox.height, minimumHeight);
  const horizontalPadding = Math.min(0.006, Math.max(0.0015, height * 0.12));
  const verticalPadding = Math.min(0.004, Math.max(0.001, height * 0.12));
  const x = Math.max(0, bbox.x - horizontalPadding);
  const y = Math.max(0, bbox.y - verticalPadding);
  return {
    x,
    y,
    width: Math.min(1 - x, width + horizontalPadding * 2),
    height: Math.min(1 - y, height + verticalPadding * 2),
  };
}

export function sourceBlockHighlightRectangles(
  blocks: readonly SourceBlock[],
): HighlightRectangle[] {
  const lines: HighlightRectangle[] = [];
  const sorted = blocks.slice().sort(
    (left, right) =>
      left.pageIndex - right.pageIndex ||
      left.bbox.y - right.bbox.y ||
      left.bbox.x - right.bbox.x ||
      left.order - right.order,
  );

  for (const block of sorted) {
    const blockBottom = block.bbox.y + block.bbox.height;
    const line = lines.findLast((candidate) => {
      if (candidate.pageIndex !== block.pageIndex) return false;
      const candidateBottom = candidate.bbox.y + candidate.bbox.height;
      const verticalOverlap =
        Math.min(candidateBottom, blockBottom) -
        Math.max(candidate.bbox.y, block.bbox.y);
      const minimumHeight = Math.min(candidate.bbox.height, block.bbox.height);
      const horizontalGap = block.bbox.x - (candidate.bbox.x + candidate.bbox.width);
      return (
        verticalOverlap >= minimumHeight * 0.35 &&
        horizontalGap <= Math.max(0.025, minimumHeight * 1.5)
      );
    });

    if (!line) {
      lines.push({
        id: block.id,
        pageIndex: block.pageIndex,
        bbox: { ...block.bbox },
      });
      continue;
    }

    const left = Math.min(line.bbox.x, block.bbox.x);
    const top = Math.min(line.bbox.y, block.bbox.y);
    const right = Math.max(
      line.bbox.x + line.bbox.width,
      block.bbox.x + block.bbox.width,
    );
    const bottom = Math.max(
      line.bbox.y + line.bbox.height,
      block.bbox.y + block.bbox.height,
    );
    line.id = `${line.id}:${block.id}`;
    line.bbox = { x: left, y: top, width: right - left, height: bottom - top };
  }

  return lines.map((line) => ({
    ...line,
    bbox: paddedHighlightBox(line.bbox),
  }));
}

export function DocumentPreview() {
  const analysis = useAppStore((state) => state.analysis)!;
  const jobVariant = useAppStore((state) => state.jobMatch?.variant);
  const activeResumeVariantId = useAppStore(
    (state) => state.activeResumeVariantId,
  );
  const selectedSuggestionId = useAppStore(
    (state) => state.selectedSuggestionId,
  );
  const selectedTemplate = useAppStore((state) => state.selectedTemplate);
  const render = useAppStore((state) => state.renders[selectedTemplate]);
  const mode = useAppStore((state) => state.previewMode);
  const setMode = useAppStore((state) => state.setPreviewMode);
  const markRenderPreviewed = useAppStore((state) => state.markRenderPreviewed);
  const attachOriginalPdf = useAppStore((state) => state.attachOriginalPdf);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageSelection, setPageSelection] = useState({
    page: 0,
    targetKey: null as string | null,
  });
  const [zoom, setZoom] = useState(0.82);
  const [attachingPdf, setAttachingPdf] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const activeResumeName =
    jobVariant && jobVariant.id === activeResumeVariantId
      ? jobVariant.name
      : "通用版";

  const suggestion = analysis.suggestions.find(
    (item) => item.id === selectedSuggestionId,
  );
  const highlightTargets = useMemo(() => {
    return suggestion
      ? resolveSuggestionSourceBlocks(analysis.resume, suggestion)
      : [];
  }, [analysis.resume, suggestion]);
  const highlightTargetKey = highlightTargets.length
    ? `${suggestion?.id ?? "unknown"}:${highlightTargets.map((block) => block.id).join(":")}`
    : null;
  const suggestedPage = highlightTargets[0]?.pageIndex;
  const unboundedPage =
    pageSelection.targetKey === highlightTargetKey
      ? pageSelection.page
      : (suggestedPage ?? pageSelection.page);
  const page = Math.min(
    Math.max(0, analysis.resume.pageCount - 1),
    Math.max(0, unboundedPage),
  );
  const setPage = useCallback(
    (nextPage: number | ((currentPage: number) => number)) => {
      setPageSelection((currentSelection) => {
        const currentPage =
          currentSelection.targetKey === highlightTargetKey
            ? currentSelection.page
            : (suggestedPage ?? currentSelection.page);
        const resolvedPage =
          typeof nextPage === "function" ? nextPage(currentPage) : nextPage;
        return {
          page: Math.min(
            Math.max(0, analysis.resume.pageCount - 1),
            Math.max(0, resolvedPage),
          ),
          targetKey: highlightTargetKey,
        };
      });
    },
    [analysis.resume.pageCount, highlightTargetKey, suggestedPage],
  );
  const highlights = useMemo(
    () =>
      sourceBlockHighlightRectangles(
        highlightTargets.filter((block) => block.pageIndex === page),
      ),
    [highlightTargets, page],
  );
  const lowConfidencePages = useMemo(() => {
    const pages = new Map<number, number>();
    for (const block of analysis.resume.sourceBlocks) {
      if (block.source !== "ocr" || block.confidence >= 0.8) continue;
      pages.set(
        block.pageIndex,
        Math.min(pages.get(block.pageIndex) ?? 1, block.confidence),
      );
    }
    return [...pages.entries()].sort(([left], [right]) => left - right);
  }, [analysis.resume.sourceBlocks]);
  const parsingNoticeCount =
    analysis.resume.parsingWarnings.length + lowConfidencePages.length;
  const originalPdf = analysis.originalPdfBase64
    ? pdfDataUrl(analysis.originalPdfBase64)
    : null;
  const currentPdf = render ? pdfDataUrl(render.pdfBase64) : null;
  const handleVerifiedPreview = useCallback(
    (sha256: string) => markRenderPreviewed(sha256),
    [markRenderPreviewed],
  );

  async function attachPdf(file: File) {
    setAttachingPdf(true);
    setAttachError(null);
    try {
      await attachOriginalPdf(file);
    } catch (error) {
      setAttachError(
        error instanceof Error ? error.message : "无法恢复原 PDF，请重试。",
      );
    } finally {
      setAttachingPdf(false);
    }
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-[#e9ebef]"
      aria-label="简历预览"
    >
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-4">
        <div
          className="flex rounded-[8px] bg-[#f0f1f3] p-1"
          aria-label="预览版本"
        >
          {(["original", "current"] as const).map(
            (value) => (
              <button
                key={value}
                type="button"
                disabled={value === "original" && !originalPdf}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`min-h-11 rounded-[6px] px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${mode === value ? "bg-white text-ink shadow-sm" : "text-muted"}`}
              >
                {value === "original" ? "原版 PDF" : "新版 PDF"}
              </button>
            ),
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="缩小"
            onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))}
            className="grid size-11 place-items-center rounded-[8px] text-muted hover:bg-[#f0f1f3]"
          >
            <Minus aria-hidden="true" size={17} />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="放大"
            onClick={() => setZoom((value) => Math.min(1.3, value + 0.1))}
            className="grid size-11 place-items-center rounded-[8px] text-muted hover:bg-[#f0f1f3]"
          >
            <Plus aria-hidden="true" size={17} />
          </button>
        </div>
      </div>

      {parsingNoticeCount > 0 ? (
        <details className="group shrink-0 border-b border-[#ead7a3] bg-[#fffaf0]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-xs font-medium text-[#72510b] [&::-webkit-details-marker]:hidden">
            <CircleAlert aria-hidden="true" size={16} className="shrink-0" />
            解析提醒 {parsingNoticeCount}
            <span className="ml-auto text-[11px] font-normal text-[#8a6a26] group-open:hidden">
              展开核对
            </span>
          </summary>
          <div className="border-t border-[#ead7a3] px-4 py-3 text-xs leading-5 text-[#604b20]">
            {analysis.resume.parsingWarnings.length > 0 ? (
              <ul className="space-y-1.5">
                {analysis.resume.parsingWarnings.map((warning, index) => (
                  <li key={`${index}-${warning}`} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {lowConfidencePages.length > 0 ? (
              <div
                className={analysis.resume.parsingWarnings.length ? "mt-2" : ""}
              >
                {lowConfidencePages.map(([pageIndex, confidence]) => (
                  <button
                    key={pageIndex}
                    type="button"
                    onClick={() => {
                      setPage(pageIndex);
                      setMode("original");
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[6px] px-2 text-left transition-colors hover:bg-[#f8edcf]"
                  >
                    <span>第 {pageIndex + 1} 页包含低置信度 OCR 区块</span>
                    <span className="shrink-0 tabular-nums">
                      最低 {Math.round(confidence * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {mode === "current" && render ? (
          <div
            className="mx-auto h-[calc(100dvh-190px)] min-h-[560px] max-w-[900px] overflow-hidden bg-white shadow-panel"
            style={{ width: `${zoom * 100}%` }}
          >
            <ClientPdfPreview
              key={render.sha256}
              artifactSha256={render.sha256}
              title={`${activeResumeName} ${selectedTemplate} 模板预览`}
              iframeSrc={currentPdf ?? ""}
              pdfBase64={render.pdfBase64}
              onVerified={handleVerifiedPreview}
            />
          </div>
        ) : mode === "current" ? (
          <div className="mx-auto grid aspect-[210/297] max-w-[620px] place-items-center bg-white p-8 text-center shadow-panel">
            <div>
              <FileText
                aria-hidden="true"
                size={32}
                className="mx-auto text-muted"
              />
              <p className="mt-3 text-sm font-medium">尚未生成当前版本</p>
              <p className="mt-1 text-xs text-muted">
                在右侧“排版预览”中选择模板。
              </p>
            </div>
          </div>
        ) : mode === "original" && originalPdf ? (
          <div
            className="relative mx-auto origin-top overflow-hidden bg-white shadow-panel"
            style={{ width: `${zoom * 100}%`, maxWidth: 880 }}
          >
            <OriginalPdfPage
              pdfBase64={analysis.originalPdfBase64!}
              iframeSrc={originalPdf}
              pageIndex={page}
              title="原始简历 PDF"
              highlights={highlights}
            />
          </div>
        ) : !originalPdf ? (
          <div className="mx-auto grid aspect-[210/297] max-w-[620px] place-items-center bg-white p-8 text-center shadow-panel">
            <div className="max-w-sm">
              <FileText
                aria-hidden="true"
                size={32}
                className="mx-auto text-muted"
              />
              <p className="mt-4 text-sm font-semibold text-ink">
                原 PDF 已从本机记录中释放
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                请重新上传原 PDF
                以恢复原版预览。系统只会重新附加文件，不会重新分析或覆盖现有修改。
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                aria-label="重新选择原 PDF"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void attachPdf(file);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={attachingPdf}
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Upload aria-hidden="true" size={17} />
                {attachingPdf ? (
                  <>
                    <span>正在恢复</span>
                    <EstimatedProgressText
                      expectedDurationMs={estimatedDurations.localOperation}
                      label="原 PDF 恢复预估进度"
                      className="text-white/85"
                    />
                  </>
                ) : (
                  `重新附加 ${analysis.resume.originalFileName}`
                )}
              </button>
              {attachError ? (
                <p className="mt-3 text-xs leading-5 text-danger" role="alert">
                  {attachError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {mode === "original" && originalPdf && analysis.resume.pageCount > 1 ? (
        <div className="flex h-14 items-center justify-center gap-3 border-t border-line bg-white">
          <button
            type="button"
            aria-label="上一页"
            disabled={page === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            className="grid size-11 place-items-center rounded-[8px] text-muted hover:bg-[#f0f1f3] disabled:opacity-30"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <span className="text-xs tabular-nums text-muted">
            {page + 1} / {analysis.resume.pageCount}
          </span>
          <button
            type="button"
            aria-label="下一页"
            disabled={page >= analysis.resume.pageCount - 1}
            onClick={() =>
              setPage((value) =>
                Math.min(analysis.resume.pageCount - 1, value + 1),
              )
            }
            className="grid size-11 place-items-center rounded-[8px] text-muted hover:bg-[#f0f1f3] disabled:opacity-30"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
      ) : null}
    </section>
  );
}
