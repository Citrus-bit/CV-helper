"use client";

import { useEffect, useState } from "react";

const UPDATE_INTERVAL_MS = 250;

export const estimatedDurations = {
  resumeAnalysis: 300_000,
  aiRewrite: 420_000,
  aiChat: 420_000,
  jobMatch: 180_000,
  interviewPlan: 120_000,
  answerEvaluation: 90_000,
  layoutRecommendation: 60_000,
  pdfGeneration: 30_000,
  pdfVerification: 15_000,
  localOperation: 5_000,
} as const;

export function estimatedProgressAt(
  elapsedMs: number,
  expectedDurationMs: number,
) {
  const duration = Math.max(expectedDurationMs, UPDATE_INTERVAL_MS);
  const ratio = Math.min(Math.max(elapsedMs, 0) / duration, 1);
  const easedRatio = 1 - (1 - ratio) ** 2;
  return Math.min(99, Math.floor(1 + 98 * easedRatio));
}

function useEstimatedProgress(expectedDurationMs: number) {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setProgress((current) =>
        Math.max(
          current,
          estimatedProgressAt(Date.now() - startedAt, expectedDurationMs),
        ),
      );
    }, UPDATE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [expectedDurationMs]);

  return progress;
}

type EstimatedProgressProps = {
  expectedDurationMs: number;
  label: string;
  className?: string;
};

export function EstimatedProgressText({
  expectedDurationMs,
  label,
  className = "",
}: EstimatedProgressProps) {
  const progress = useEstimatedProgress(expectedDurationMs);

  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={`预估完成 ${progress}%`}
      className={`inline-block min-w-[5.5em] text-right tabular-nums ${className}`}
    >
      <span aria-hidden="true">预估 {progress}%</span>
    </span>
  );
}

export function EstimatedProgressBar({
  expectedDurationMs,
  label,
  className = "",
}: EstimatedProgressProps) {
  const progress = useEstimatedProgress(expectedDurationMs);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={`预估完成 ${progress}%`}
      className={className}
    >
      <div className="flex items-center justify-between gap-4 text-xs font-medium text-muted">
        <span>预估进度</span>
        <span className="w-[4ch] text-right tabular-nums text-ink">
          {progress}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e4e5e8]">
        <span
          className="block h-full rounded-full bg-brand transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
