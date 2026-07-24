"use client";

import { FileSearch, LoaderCircle, ScanText, Sparkles } from "lucide-react";
import { useEffect } from "react";
import {
  cancelAnalysisRequest,
  retainAnalysisRequest,
} from "@/lib/client/analysis-request";
import { useAppStore } from "@/lib/client/store";

const analysisContents = [
  {
    label: "PDF 文字与版面",
    detail: "优先读取原生文字层",
    icon: FileSearch,
  },
  {
    label: "扫描内容识别",
    detail: "仅在文字缺失时启用 OCR",
    icon: ScanText,
  },
  {
    label: "证据、评分与修改建议",
    detail: "完整结果生成后统一展示",
    icon: Sparkles,
  },
];

export function AnalysisProgress() {
  const reset = useAppStore((state) => state.reset);

  useEffect(() => {
    const releaseRequest = retainAnalysisRequest();
    return () => {
      releaseRequest();
    };
  }, []);

  function cancel() {
    cancelAnalysisRequest();
    reset();
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-8 py-8">
      <section
        aria-labelledby="analysis-progress-heading"
        aria-busy="true"
        className="grid w-full max-w-4xl grid-cols-[1.05fr_0.95fr] overflow-hidden rounded-[8px] border border-line bg-surface shadow-panel"
      >
        <div className="border-r border-line bg-[#eceff3] p-7">
          <div className="mx-auto aspect-[210/297] max-h-[560px] w-full max-w-[395px] bg-white p-8 shadow-sm">
            <div className="h-5 w-40 animate-pulse rounded bg-[#d7dbe1] motion-reduce:animate-none" />
            <div className="mt-3 h-3 w-52 animate-pulse rounded bg-[#e7e9ed] motion-reduce:animate-none" />
            <div className="mt-8 h-3 w-24 animate-pulse rounded bg-[#cfd5dd] motion-reduce:animate-none" />
            {[92, 100, 88, 96].map((width, index) => (
              <div
                key={`${index}-${width}`}
                className="mt-3 h-2.5 animate-pulse rounded bg-[#eaecf0] motion-reduce:animate-none"
                style={{ width: `${width}%` }}
              />
            ))}
            <div className="mt-8 h-3 w-28 animate-pulse rounded bg-[#cfd5dd] motion-reduce:animate-none" />
            {[96, 84, 100, 72, 93, 80].map((width, index) => (
              <div
                key={`${index}-${width}`}
                className="mt-3 h-2.5 animate-pulse rounded bg-[#eaecf0] motion-reduce:animate-none"
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
              className="animate-spin motion-reduce:animate-none"
            />
          </span>
          <h1
            id="analysis-progress-heading"
            data-page-heading
            tabIndex={-1}
            className="mt-6 text-2xl font-semibold outline-none"
          >
            正在分析简历
          </h1>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-2 max-w-sm text-sm leading-6 text-muted"
          >
            分析完成后会自动进入结果页。复杂扫描页可能需要更长时间。
          </p>

          <div className="mt-8" aria-labelledby="analysis-contents-heading">
            <h2
              id="analysis-contents-heading"
              className="px-3 text-xs font-medium text-muted"
            >
              分析内容
            </h2>
            <ul className="mt-2 space-y-1">
              {analysisContents.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.label}
                    className="flex min-h-14 items-center gap-3 rounded-[8px] px-3 text-sm text-ink"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eceef1] text-muted">
                      <Icon aria-hidden="true" size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{item.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted">
                        {item.detail}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

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
