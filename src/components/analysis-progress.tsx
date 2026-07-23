"use client";

import {
  Check,
  FileSearch,
  LoaderCircle,
  ScanText,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  cancelAnalysisRequest,
  retainAnalysisRequest,
} from "@/lib/client/analysis-request";
import { useAppStore } from "@/lib/client/store";

const steps = [
  { label: "校验 PDF", icon: FileSearch },
  { label: "提取文字层", icon: ScanText },
  { label: "建立证据链", icon: Sparkles },
  { label: "生成评分与建议", icon: Sparkles },
];

export function AnalysisProgress() {
  const [active, setActive] = useState(0);
  const reset = useAppStore((state) => state.reset);

  useEffect(() => {
    const releaseRequest = retainAnalysisRequest();
    const timer = window.setInterval(
      () => setActive((value) => Math.min(steps.length - 1, value + 1)),
      1200,
    );
    return () => {
      window.clearInterval(timer);
      releaseRequest();
    };
  }, []);

  function cancel() {
    cancelAnalysisRequest();
    reset();
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-8 py-8">
      <section className="grid w-full max-w-4xl grid-cols-[1.05fr_0.95fr] overflow-hidden rounded-[8px] border border-line bg-surface shadow-panel">
        <div className="border-r border-line bg-[#eceff3] p-7">
          <div className="mx-auto aspect-[210/297] max-h-[560px] w-full max-w-[395px] bg-white p-8 shadow-sm">
            <div className="h-5 w-40 animate-pulse rounded bg-[#d7dbe1]" />
            <div className="mt-3 h-3 w-52 animate-pulse rounded bg-[#e7e9ed]" />
            <div className="mt-8 h-3 w-24 animate-pulse rounded bg-[#cfd5dd]" />
            {[92, 100, 88, 96].map((width, index) => (
              <div
                key={`${index}-${width}`}
                className="mt-3 h-2.5 animate-pulse rounded bg-[#eaecf0]"
                style={{ width: `${width}%` }}
              />
            ))}
            <div className="mt-8 h-3 w-28 animate-pulse rounded bg-[#cfd5dd]" />
            {[96, 84, 100, 72, 93, 80].map((width, index) => (
              <div
                key={`${index}-${width}`}
                className="mt-3 h-2.5 animate-pulse rounded bg-[#eaecf0]"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center p-10">
          <span className="inline-flex size-11 items-center justify-center rounded-[8px] bg-ink text-white">
            <LoaderCircle
              aria-hidden="true"
              size={21}
              className="animate-spin"
            />
          </span>
          <h1 className="mt-6 text-2xl font-semibold">正在分析简历</h1>
          <p className="mt-2 text-sm leading-6 text-muted" aria-live="polite">
            {steps[active].label}。复杂扫描页可能需要更长时间。
          </p>

          <ol className="mt-8 space-y-1">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const complete = index < active;
              const current = index === active;
              return (
                <li
                  key={step.label}
                  className={`flex min-h-12 items-center gap-3 rounded-[8px] px-3 text-sm ${current ? "bg-[#edf5ff] text-ink" : "text-muted"}`}
                >
                  <span
                    className={`grid size-7 place-items-center rounded-full ${
                      complete
                        ? "bg-success text-white"
                        : current
                          ? "bg-brand text-white"
                          : "bg-[#eceef1]"
                    }`}
                  >
                    {complete ? (
                      <Check aria-hidden="true" size={15} />
                    ) : (
                      <Icon aria-hidden="true" size={14} />
                    )}
                  </span>
                  {step.label}
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            onClick={cancel}
            className="mt-7 min-h-11 self-start rounded-[8px] px-3 text-sm font-medium text-muted transition-colors hover:bg-[#f0f1f3] hover:text-ink"
          >
            取消分析
          </button>
        </div>
      </section>
    </main>
  );
}
