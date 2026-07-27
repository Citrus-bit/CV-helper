"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { BoundingBox } from "@/lib/domain";

import { renderPdfPage } from "./pdf-page-renderer";

export type PdfHighlight = {
  id: string;
  bbox: BoundingBox;
};

type OriginalPdfPageProps = {
  pdfBase64: string;
  iframeSrc: string;
  pageIndex: number;
  title: string;
  highlights: readonly PdfHighlight[];
};

export function OriginalPdfPage({
  pdfBase64,
  iframeSrc,
  pageIndex,
  title,
  highlights,
}: OriginalPdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderState, setRenderState] = useState<"rendering" | "ready" | "failed">(
    "rendering",
  );
  const [aspectRatio, setAspectRatio] = useState("210 / 297");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    setRenderState("rendering");

    void renderPdfPage(pdfBase64, pageIndex, canvas, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setAspectRatio(`${result.width} / ${result.height}`);
        setRenderState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setRenderState("failed");
      });

    return () => controller.abort();
  }, [pageIndex, pdfBase64]);

  return (
    <div
      className="relative w-full overflow-hidden bg-white"
      style={{ aspectRatio }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${title}第 ${pageIndex + 1} 页`}
        className={`block h-auto w-full bg-white ${
          renderState === "failed" ? "invisible" : ""
        }`}
      />

      {renderState === "failed" ? (
        <>
          <iframe
            title={`${title}（浏览器预览）`}
            src={`${iframeSrc}#page=${pageIndex + 1}`}
            className="absolute inset-0 size-full border-0 bg-white"
          />
          <p
            className="absolute inset-x-3 top-3 z-[1] flex items-center gap-2 rounded-[6px] border border-[#ead7a3] bg-[#fffaf0] px-3 py-2 text-xs text-[#72510b] shadow-sm"
            role="alert"
          >
            <CircleAlert aria-hidden="true" size={15} className="shrink-0" />
            原文定位暂不可用，已显示浏览器 PDF 预览。
          </p>
        </>
      ) : null}

      {renderState === "ready"
        ? highlights.map((highlight, index) => (
            <span
              key={highlight.id}
              aria-label={
                index === 0 ? "当前建议对应的原文位置" : undefined
              }
              aria-hidden={index === 0 ? undefined : "true"}
              className="pointer-events-none absolute bg-[#cfe5ff]/20 outline outline-2 outline-brand"
              style={{
                left: `${highlight.bbox.x * 100}%`,
                top: `${highlight.bbox.y * 100}%`,
                width: `${highlight.bbox.width * 100}%`,
                height: `${highlight.bbox.height * 100}%`,
              }}
            />
          ))
        : null}

      {renderState === "rendering" ? (
        <div
          className="absolute inset-0 grid place-items-center bg-white/95"
          role="status"
        >
          <div className="text-center text-sm font-medium text-muted">
            <LoaderCircle
              aria-hidden="true"
              size={24}
              className="mx-auto mb-3 animate-spin text-brand"
            />
            正在载入原版 PDF
          </div>
        </div>
      ) : null}
    </div>
  );
}
