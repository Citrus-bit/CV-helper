"use client";

import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  EstimatedProgressText,
  estimatedDurations,
} from "../estimated-progress";
import { renderPdfPage } from "./pdf-page-renderer";

type ClientPdfPreviewProps = {
  artifactSha256: string;
  iframeSrc: string;
  pdfBase64: string;
  title: string;
  onVerified: (sha256: string) => void;
};

type VerificationState = "rendering" | "verified" | "failed";

export function ClientPdfPreview({
  artifactSha256,
  iframeSrc,
  pdfBase64,
  title,
  onVerified,
}: ClientPdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [verification, setVerification] =
    useState<VerificationState>("rendering");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new AbortController();
    setVerification("rendering");

    void renderPdfPage(pdfBase64, 0, canvas, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        setVerification("verified");
        onVerified(artifactSha256);
      })
      .catch(() => {
        if (!controller.signal.aborted) setVerification("failed");
      });

    return () => controller.abort();
  }, [artifactSha256, onVerified, pdfBase64, retryKey]);

  return (
    <div className="relative size-full overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full bg-white"
      />
      <iframe
        title={title}
        src={iframeSrc}
        className="relative z-[1] size-full border-0 bg-white"
      />

      {verification === "rendering" ? (
        <div
          className="absolute inset-0 z-[2] grid place-items-center bg-white/95"
          role="status"
        >
          <div className="text-center text-sm font-medium text-muted">
            <LoaderCircle
              aria-hidden="true"
              size={24}
              className="mx-auto mb-3 animate-spin text-brand"
            />
            <p>正在验证新版 PDF 首屏</p>
            <EstimatedProgressText
              expectedDurationMs={estimatedDurations.pdfVerification}
              label="PDF 首屏验证预估进度"
              className="mt-1 min-w-0 text-center text-xs font-normal"
            />
          </div>
        </div>
      ) : null}

      {verification === "failed" ? (
        <div
          className="absolute inset-0 z-[2] grid place-items-center bg-white p-6 text-center"
          role="alert"
        >
          <div className="max-w-sm">
            <AlertCircle
              aria-hidden="true"
              size={28}
              className="mx-auto text-danger"
            />
            <p className="mt-3 text-sm font-semibold text-ink">
              新版 PDF 首屏渲染失败
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              当前版本不能确认或下载，请重试首屏验证。
            </p>
            <button
              type="button"
              onClick={() => setRetryKey((value) => value + 1)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf]"
            >
              <RotateCcw aria-hidden="true" size={16} />
              重新验证
            </button>
          </div>
        </div>
      ) : null}

      {verification === "verified" ? (
        <span className="sr-only" role="status">
          新版 PDF 第一页已完成像素渲染验证。
        </span>
      ) : null}
    </div>
  );
}
