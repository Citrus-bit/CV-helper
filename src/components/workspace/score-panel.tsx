"use client";

import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleX,
  Info,
} from "lucide-react";
import { useState } from "react";
import type { AtsAudit, Scorecard, SourceBlock } from "@/lib/domain";

const severityMeta = {
  info: { label: "提示", icon: Info, className: "text-brand" },
  warning: {
    label: "需关注",
    icon: CircleAlert,
    className: "text-warning",
  },
  error: { label: "阻断", icon: CircleX, className: "text-danger" },
} as const;

function sourceExcerpt(text: string, maxLength = 110) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
}

type ScorePanelProps = {
  scorecard: Scorecard;
  atsAudit?: AtsAudit;
  sourceBlocks?: SourceBlock[];
};

export function ScorePanel({
  scorecard,
  atsAudit,
  sourceBlocks = [],
}: ScorePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const sourceBlockById = new Map(
    sourceBlocks.map((block) => [block.id, block]),
  );
  return (
    <section
      className="border-b border-line px-5 py-4"
      aria-labelledby="score-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id="score-heading" className="text-xs font-medium text-muted">
            简历内容评分
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

      {atsAudit ? (
        <div className="mt-3 flex min-h-10 items-center justify-between gap-3 border-y border-line py-2 text-xs">
          <div className="flex items-center gap-2">
            {atsAudit.passed ? (
              <CheckCircle2
                aria-hidden="true"
                size={17}
                className="shrink-0 text-success"
              />
            ) : (
              <CircleAlert
                aria-hidden="true"
                size={17}
                className="shrink-0 text-danger"
              />
            )}
            <span className="font-medium text-ink">ATS 专项审计</span>
            <span className="tabular-nums text-muted">
              {Math.round(atsAudit.score)} / 100
            </span>
          </div>
          <span
            className={`font-medium ${atsAudit.passed ? "text-success" : "text-danger"}`}
          >
            {atsAudit.passed ? "通过" : "需处理"}
          </span>
        </div>
      ) : (
        <p className="mt-3 border-y border-line py-2 text-xs text-muted">
          ATS 专项审计：旧记录未包含此结果
        </p>
      )}

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
        <div className="mt-4 max-h-60 overflow-y-auto rounded-[8px] bg-[#f6f7f9] p-3 text-xs leading-5 text-muted">
          <p className="text-ink">{scorecard.summary}</p>
          <div className="mt-3 space-y-3">
            {atsAudit ? (
              <section aria-label="ATS专项审计详情">
                <div className="flex items-center justify-between gap-3 font-medium text-ink">
                  <span>ATS 专项审计</span>
                  <span className="tabular-nums">
                    {Math.round(atsAudit.score)}/100 ·{" "}
                    {atsAudit.passed ? "通过" : "需处理"}
                  </span>
                </div>
                {atsAudit.findings.length > 0 ? (
                  <ul className="mt-2 divide-y divide-line border-y border-line">
                    {atsAudit.findings.map((finding, index) => {
                      const meta = severityMeta[finding.severity];
                      const Icon = meta.icon;
                      const linkedBlocks = finding.sourceBlockIds
                        .map((id) => sourceBlockById.get(id))
                        .filter((block) => block !== undefined);
                      return (
                        <li
                          key={`${finding.code}-${index}`}
                          className="py-2 first:pt-2 last:pb-2"
                        >
                          <div className="flex items-start gap-2">
                            <Icon
                              aria-hidden="true"
                              size={15}
                              className={`mt-0.5 shrink-0 ${meta.className}`}
                            />
                            <div className="min-w-0">
                              <p className="text-ink">
                                <strong
                                  className={`font-medium ${meta.className}`}
                                >
                                  {meta.label}：
                                </strong>
                                {finding.message}
                              </p>
                              {linkedBlocks.length > 0 ? (
                                <ul className="mt-1 space-y-1 border-l border-line pl-2 text-muted">
                                  {linkedBlocks.map((block) => (
                                    <li key={block.id}>
                                      来源第 {block.pageIndex + 1} 页：
                                      {sourceExcerpt(block.text)}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-1 text-success">未发现 ATS 专项风险</p>
                )}
              </section>
            ) : null}
            {scorecard.dimensions.map((dimension) => (
              <section
                key={dimension.id}
                aria-label={`${dimension.label}评分依据`}
              >
                <div className="flex items-center justify-between gap-3 font-medium text-ink">
                  <span>{dimension.label}</span>
                  <span className="tabular-nums">
                    {Math.round(dimension.score)}/{dimension.maxScore}
                  </span>
                </div>
                {dimension.deductions.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {dimension.deductions.map((deduction) => (
                      <li key={deduction}>扣分：{deduction}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-success">未发现明确扣分项</p>
                )}
                {dimension.evidence.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 border-l border-line pl-2">
                    {dimension.evidence.map((evidence) => (
                      <li key={evidence}>依据：{evidence}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
