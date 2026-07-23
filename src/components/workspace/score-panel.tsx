"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Scorecard } from "@/lib/domain";

export function ScorePanel({ scorecard }: { scorecard: Scorecard }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="border-b border-line px-5 py-4"
      aria-labelledby="score-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id="score-heading" className="text-xs font-medium text-muted">
            当前简历质量
          </p>
          <div className="mt-1 flex items-baseline gap-1">
            <strong className="text-[30px] font-semibold tabular-nums leading-none">
              {Math.round(scorecard.total)}
            </strong>
            <span className="text-sm text-muted">/ 100</span>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-11 items-center gap-1 rounded-[8px] px-3 text-sm font-medium text-brand hover:bg-[#edf5ff]"
        >
          评分依据
          <ChevronDown
            aria-hidden="true"
            size={16}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
        {scorecard.dimensions.map((dimension) => {
          const percent = Math.round(
            (dimension.score / dimension.maxScore) * 100,
          );
          return (
            <div key={dimension.id}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-muted">
                  {dimension.label}
                </span>
                <span className="tabular-nums text-ink">
                  {Math.round(dimension.score)}/{dimension.maxScore}
                </span>
              </div>
              <div
                role="meter"
                aria-label={`${dimension.label} ${Math.round(dimension.score)} 分，满分 ${dimension.maxScore} 分`}
                aria-valuenow={dimension.score}
                aria-valuemin={0}
                aria-valuemax={dimension.maxScore}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e8eaed]"
              >
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {expanded ? (
        <div className="mt-4 rounded-[8px] bg-[#f6f7f9] p-3 text-xs leading-5 text-muted">
          <p>{scorecard.summary}</p>
          <ul className="mt-2 space-y-1">
            {scorecard.dimensions.flatMap((dimension) =>
              dimension.deductions.slice(0, 1).map((deduction) => (
                <li key={`${dimension.id}-${deduction}`}>
                  • {dimension.label}：{deduction}
                </li>
              )),
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
