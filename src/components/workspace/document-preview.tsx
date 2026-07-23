"use client";

import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Minus,
  Plus,
  Upload,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { pdfDataUrl } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import { ClientPdfPreview } from "./client-pdf-preview";

export function DocumentPreview() {
  const analysis = useAppStore((state) => state.analysis)!;
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
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(0.82);
  const [attachingPdf, setAttachingPdf] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const suggestion = analysis.suggestions.find(
    (item) => item.id === selectedSuggestionId,
  );
  const highlight = useMemo(() => {
    const blockId = suggestion?.sourceBlockIds[0];
    return analysis.resume.sourceBlocks.find(
      (block) => block.id === blockId && block.pageIndex === page,
    );
  }, [analysis.resume.sourceBlocks, page, suggestion]);
  const preview = analysis.pagePreviews[page];
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
          {(["original", "locate", "current", "compare"] as const).map(
            (value) => (
              <button
                key={value}
                type="button"
                disabled={
                  (value === "original" && !originalPdf) ||
                  (value === "locate" && !preview) ||
                  (value === "compare" && (!originalPdf || !currentPdf))
                }
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`min-h-11 rounded-[6px] px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${mode === value ? "bg-white text-ink shadow-sm" : "text-muted"}`}
              >
                {value === "original"
                  ? "原版 PDF"
                  : value === "locate"
                    ? "原文定位"
                    : value === "current"
                      ? "新版 PDF"
                      : "并排对照"}
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

      <div className="min-h-[520px] flex-1 overflow-auto p-6">
        {mode === "compare" ? (
          originalPdf && currentPdf && render ? (
            <div
              className="mx-auto grid max-w-[1440px] grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-4"
              style={{ width: `${zoom * 100}%` }}
            >
              <div className="min-w-0">
                <p className="mb-2 text-xs font-semibold text-muted">
                  原始 PDF
                </p>
                <div className="aspect-[210/297] min-h-[520px] overflow-hidden bg-white shadow-panel">
                  <iframe
                    title="原始简历 PDF 预览"
                    src={originalPdf}
                    className="size-full border-0"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-xs font-semibold text-muted">
                  {selectedTemplate} 新版 PDF
                </p>
                <div className="aspect-[210/297] min-h-[520px] overflow-hidden bg-white shadow-panel">
                  <ClientPdfPreview
                    key={render.sha256}
                    artifactSha256={render.sha256}
                    title={`当前简历 ${selectedTemplate} 模板预览`}
                    iframeSrc={currentPdf}
                    pdfBase64={render.pdfBase64}
                    onVerified={handleVerifiedPreview}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto grid aspect-[210/297] max-w-[620px] place-items-center bg-white p-8 text-center shadow-panel">
              <div>
                <FileText
                  aria-hidden="true"
                  size={32}
                  className="mx-auto text-muted"
                />
                <p className="mt-3 text-sm font-medium">需要重新生成并排预览</p>
                <p className="mt-1 text-xs text-muted">
                  内容变化后，新版 PDF 和旧确认都会失效。
                </p>
              </div>
            </div>
          )
        ) : mode === "current" && render ? (
          <div
            className="mx-auto h-[calc(100dvh-190px)] min-h-[560px] max-w-[900px] overflow-hidden bg-white shadow-panel"
            style={{ width: `${zoom * 100}%` }}
          >
            <ClientPdfPreview
              key={render.sha256}
              artifactSha256={render.sha256}
              title={`当前简历 ${selectedTemplate} 模板预览`}
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
            className="mx-auto h-[calc(100dvh-190px)] min-h-[560px] max-w-[900px] overflow-hidden bg-white shadow-panel"
            style={{ width: `${zoom * 100}%` }}
          >
            <iframe
              title="原始简历 PDF 预览"
              src={originalPdf}
              className="size-full border-0"
            />
          </div>
        ) : mode === "locate" && preview ? (
          <div
            className="relative mx-auto origin-top bg-white shadow-panel transition-[width] duration-200"
            style={{ width: `${zoom * 100}%`, maxWidth: 880 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={`原始简历第 ${page + 1} 页`}
              className="h-auto w-full"
            />
            {highlight ? (
              <span
                aria-label="当前建议对应的原文位置"
                className="pointer-events-none absolute border-2 border-brand bg-[#cfe5ff]/35"
                style={{
                  left: `${highlight.bbox.x * 100}%`,
                  top: `${highlight.bbox.y * 100}%`,
                  width: `${Math.max(4, highlight.bbox.width * 100)}%`,
                  height: `${Math.max(2, highlight.bbox.height * 100)}%`,
                }}
              />
            ) : null}
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
                {attachingPdf
                  ? "正在恢复"
                  : `重新附加 ${analysis.resume.originalFileName}`}
              </button>
              {attachError ? (
                <p className="mt-3 text-xs leading-5 text-danger" role="alert">
                  {attachError}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mx-auto grid aspect-[210/297] max-w-[620px] place-items-center bg-white p-8 text-center text-sm text-muted shadow-panel">
            原文定位图已清理，请切换到“原版 PDF”继续查看。
          </div>
        )}
      </div>

      {mode === "locate" && analysis.resume.pageCount > 1 ? (
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
