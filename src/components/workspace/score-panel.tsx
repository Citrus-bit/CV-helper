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
  const showsChecklistProgress = scorecard.summary.startsWith("本次优化清单");
  const sourceBlockById = new Map(
    sourceBlocks.map((block) => [block.id, block]),
  );
  return (
    <section
      className="border-b border-line px-4 py-3"
      aria-labelledby="score-heading"
    >
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-baseline gap-1 border-r border-line pr-3">
          <strong className="text-[28px] font-semibold tabular-nums leading-none">
            {Math.round(scorecard.total)}
          </strong>
          <span className="text-xs text-muted">分</span>
        </div>
        <div className="min-w-0 flex-1">
          <p id="score-heading" className="text-sm font-semibold text-ink">
            {showsChecklistProgress ? "优化完成" : "简历评估"}
          </p>
          {atsAudit ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              {atsAudit.passed ? (
                <CheckCircle2
                  aria-hidden="true"
                  size={14}
                  className="shrink-0 text-success"
                />
              ) : (
                <CircleAlert
                  aria-hidden="true"
                  size={14}
                  className="shrink-0 text-danger"
                />
              )}
              <span className="truncate">
                ATS {Math.round(atsAudit.score)} 分 ·{" "}
                {atsAudit.passed ? "已通过" : "需处理"}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 truncate text-xs text-muted">
              旧记录暂无 ATS 审计
            </p>
          )}
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-10 shrink-0 items-center gap-1 rounded-[8px] px-2.5 text-xs font-medium text-muted hover:bg-[#f0f1f3] hover:text-ink"
        >
          诊断
          <ChevronDown
            aria-hidden="true"
            size={16}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 max-h-72 overflow-y-auto border-t border-line pt-3 text-xs leading-5 text-muted">
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
