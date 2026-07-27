"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FilePenLine,
  Pencil,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  resolveSuggestionSourceBlocks,
  type Claim,
  type Suggestion,
  type SuggestionKind,
} from "@/lib/domain";
import { useAppStore } from "@/lib/client/store";
import { safeAiRewriteSuggestions } from "@/lib/client/suggestions";
import {
  EstimatedProgressText,
  estimatedDurations,
} from "../estimated-progress";

const kindMeta: Record<
  SuggestionKind,
  { label: string; className: string; icon: typeof Pencil }
> = {
  use_as_is: {
    label: "保留原文",
    className: "bg-[#eef8f2] text-success",
    icon: Check,
  },
  rewrite: {
    label: "表达优化",
    className: "bg-[#edf5ff] text-brand",
    icon: Pencil,
  },
  needs_proof: {
    label: "待补证据",
    className: "bg-[#fff7df] text-warning",
    icon: ShieldAlert,
  },
  remove: {
    label: "建议移除",
    className: "bg-[#fff0ef] text-danger",
    icon: AlertTriangle,
  },
  ask_user: {
    label: "需要确认",
    className: "bg-[#f1efff] text-[#6546b8]",
    icon: CircleHelp,
  },
};

const claimStatusMeta: Record<
  Claim["status"],
  { label: string; className: string }
> = {
  resume_only: {
    label: "仅来自简历",
    className: "bg-[#f0f1f3] text-muted",
  },
  user_confirmed: {
    label: "用户已确认",
    className: "bg-[#edf5ff] text-brand",
  },
  supported: {
    label: "有材料支持",
    className: "bg-[#eef8f2] text-success",
  },
  needs_evidence: {
    label: "待补证据",
    className: "bg-[#fff7df] text-warning",
  },
  conflicting: {
    label: "存在冲突",
    className: "bg-[#fff0ef] text-danger",
  },
};

const dimensionLabel: Record<string, string> = {
  impact: "成果与影响力",
  completeness: "信息完整性",
  clarity: "清晰与精炼",
  structure: "结构与版式",
  ats: "ATS 可解析性",
  language: "语言规范性",
};

const riskLabel = {
  none: "无",
  low: "低",
  medium: "中",
  high: "高",
} as const;

export function evidenceAnswerIsValid(value: string, originalText: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const original = originalText.replace(/\s+/g, " ").trim();
  return normalized.length >= 2 && normalized !== original;
}

export function suggestionStatusMessage(suggestion: Suggestion) {
  if (suggestion.status === "rejected") return "这条建议已跳过。";
  if (suggestion.status === "stale") return "这条建议已失效。";
  if (suggestion.status === "accepted" || suggestion.status === "manual") {
    const keptOriginal =
      suggestion.kind === "use_as_is" ||
      (suggestion.kind !== "remove" &&
        suggestion.proposedText !== undefined &&
        suggestion.proposedText === suggestion.originalText);
    return keptOriginal
      ? "这条内容已确认，简历文字保持原样。"
      : "这条建议已应用，可使用顶部撤销按钮恢复。";
  }
  return "";
}

function EvidenceDialog({ suggestion }: { suggestion: Suggestion }) {
  const claims = useAppStore((state) => state.analysis?.claims ?? []);
  const confirmClaim = useAppStore((state) => state.confirmClaim);
  const claim = claims.find((item) => suggestion.claimIds.includes(item.id));
  const [value, setValue] = useState("");
  const validAnswer = evidenceAnswerIsValid(
    value,
    claim?.text ?? suggestion.originalText,
  );

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-warning px-4 text-sm font-medium text-white hover:bg-[#7d5400]"
        >
          <ShieldAlert aria-hidden="true" size={17} />
          补充事实
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[8px] bg-white p-6 shadow-panel">
          <Dialog.Title className="text-lg font-semibold">
            补充可核对的事实
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
            只填写你真实完成的动作、方法或结果。没有准确数字时，可以保留非量化表述。
          </Dialog.Description>
          {suggestion.question ? (
            <div className="mt-5 rounded-[8px] border-l-2 border-brand bg-[#f3f8ff] px-3 py-2.5">
              <p className="text-xs font-medium text-muted">需要你回答</p>
              <p className="mt-1 text-sm leading-6">{suggestion.question}</p>
            </div>
          ) : null}
          <div className="mt-4 rounded-[8px] bg-[#f7f7f8] px-3 py-2.5">
            <p className="text-xs font-medium text-muted">当前简历原文</p>
            <p className="mt-1 text-sm leading-6">
              {claim?.text ?? suggestion.originalText}
            </p>
          </div>
          <label
            className="mt-5 block text-sm font-medium"
            htmlFor={`evidence-${suggestion.id}`}
          >
            你的核对结果
          </label>
          <textarea
            id={`evidence-${suggestion.id}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={6}
            placeholder="填写真实、可在面试中说明的事实；不要直接重复原文。"
            className="mt-2 w-full resize-y rounded-[8px] border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-brand"
          />
          {!validAnswer && value.trim() ? (
            <p className="mt-2 text-xs leading-5 text-warning" role="status">
              请回答上方问题并补充可核对信息，不能直接重复原文。
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="min-h-11 rounded-[8px] px-4 text-sm font-medium text-muted hover:bg-[#f0f1f3]">
              取消
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={!claim || !validAnswer}
                onClick={() => claim && confirmClaim(claim.id, value)}
                className="min-h-11 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf] disabled:opacity-40"
              >
                生成待审阅改写
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SuggestionReview() {
  const analysis = useAppStore((state) => state.analysis)!;
  const selectedId = useAppStore((state) => state.selectedSuggestionId);
  const selectSuggestion = useAppStore((state) => state.selectSuggestion);
  const decideSuggestion = useAppStore((state) => state.decideSuggestion);
  const retryAiAnalysis = useAppStore((state) => state.retryAiAnalysis);
  const [editing, setEditing] = useState(false);
  const [manualText, setManualText] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [optimizing, setOptimizing] = useState(false);

  const selectedIndex = Math.max(
    0,
    analysis.suggestions.findIndex((item) => item.id === selectedId),
  );
  const suggestion = analysis.suggestions[selectedIndex];
  const pending = analysis.suggestions.filter(
    (item) => item.status === "pending",
  ).length;
  const meta = suggestion ? kindMeta[suggestion.kind] : null;
  const Icon = meta?.icon ?? Pencil;
  const aiStatus = analysis.processing.aiAnalysis?.status ?? "failed";
  const automaticSuggestions = useMemo(
    () => safeAiRewriteSuggestions(analysis),
    [analysis],
  );

  const evidenceLabels = useMemo(() => {
    const claimIds = new Set(suggestion?.claimIds ?? []);
    return analysis.claims.filter((claim) => claimIds.has(claim.id));
  }, [analysis.claims, suggestion]);
  const sourceBlocks = useMemo(() => {
    return suggestion
      ? resolveSuggestionSourceBlocks(analysis.resume, suggestion)
      : [];
  }, [analysis.resume, suggestion]);
  const sourceDescription = useMemo(() => {
    const first = sourceBlocks[0];
    if (!first) return "";
    const extractionSources = new Set(sourceBlocks.map((block) => block.source));
    const extractionLabel =
      extractionSources.size > 1
        ? "混合解析"
        : first.source === "ocr"
          ? "OCR"
          : "原生文字";
    return `第 ${first.pageIndex + 1} 页 · ${extractionLabel}`;
  }, [sourceBlocks]);

  if (aiStatus !== "fresh") {
    return (
      <div className="p-6 text-sm leading-6 text-muted" role="status">
        <p>
          {aiStatus === "failed"
            ? "当前版本的 AI 分析未完成，不会显示本地模板建议。"
            : "当前版本正在等待 AI 重新分析，旧建议不会作为当前结论展示。"}
        </p>
        {aiStatus === "failed" ? (
          <button
            type="button"
            onClick={retryAiAnalysis}
            className="mt-4 min-h-11 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf]"
          >
            重新进行 AI 分析
          </button>
        ) : null}
      </div>
    );
  }

  if (!suggestion) {
    return (
      <div className="p-6 text-sm leading-6 text-muted" role="status">
        AI 已完成分析，当前没有需要修改的高优先级问题。
      </div>
    );
  }

  function move(offset: number) {
    const index = Math.min(
      analysis.suggestions.length - 1,
      Math.max(0, selectedIndex + offset),
    );
    selectSuggestion(analysis.suggestions[index].id);
    setEditing(false);
  }

  async function optimizeWithAi() {
    setBulkMessage("");
    setBulkError("");
    setOptimizing(true);
    try {
      const count = useAppStore.getState().applyAiSuggestions();
      setBulkMessage(
        count > 0
          ? `已应用 ${count} 条 AI 改写，可使用顶部撤销按钮恢复。`
          : "AI 已完成逐条分析，当前没有可在不补充事实的前提下自动应用的改写。",
      );
      setEditing(false);
    } catch (error) {
      setBulkError(
        error instanceof Error
          ? error.message
          : "AI 优化未完成，请稍后重试。",
      );
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="suggestions-heading"
    >
      <div className="border-b border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="suggestions-heading" className="text-sm font-semibold">
                逐条审阅
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] font-medium ${
                  "bg-[#edf5ff] text-brand"
                }`}
              >
                <Sparkles aria-hidden="true" size={12} />
                AI 分析
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              待处理 {pending} · 共 {analysis.suggestions.length} 条
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {automaticSuggestions.length > 0 ? (
              <button
                type="button"
                onClick={() => void optimizeWithAi()}
                disabled={optimizing}
                className="inline-flex min-h-11 min-w-[184px] items-center justify-center gap-2 rounded-[8px] bg-brand px-3.5 text-sm font-medium text-white hover:bg-[#075bbf] active:bg-[#064e9f] disabled:cursor-wait disabled:opacity-70"
              >
                {optimizing ? (
                  <>
                    <span>AI 优化中</span>
                    <EstimatedProgressText
                      expectedDurationMs={estimatedDurations.aiRewrite}
                      label="AI 简历优化预估进度"
                      className="text-white/85"
                    />
                  </>
                ) : (
                  <>
                    <Sparkles aria-hidden="true" size={16} />
                    {`AI 一键优化 ${automaticSuggestions.length} 条`}
                  </>
                )}
              </button>
            ) : null}
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="上一条建议"
                disabled={selectedIndex === 0}
                onClick={() => move(-1)}
                className="grid size-11 place-items-center rounded-[8px] text-muted hover:bg-[#f0f1f3] disabled:opacity-30"
              >
                <ChevronLeft aria-hidden="true" size={18} />
              </button>
              <span className="w-12 text-center text-xs tabular-nums text-muted">
                {selectedIndex + 1}/{analysis.suggestions.length}
              </span>
              <button
                type="button"
                aria-label="下一条建议"
                disabled={selectedIndex === analysis.suggestions.length - 1}
                onClick={() => move(1)}
                className="grid size-11 place-items-center rounded-[8px] text-muted hover:bg-[#f0f1f3] disabled:opacity-30"
              >
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            </div>
          </div>
        </div>
        {bulkError ? (
          <p
            className="border-t border-line bg-[#fff0ef] px-5 py-2 text-xs leading-5 text-danger"
            role="alert"
          >
            {bulkError}
          </p>
        ) : bulkMessage ? (
          <p
            className="border-t border-line bg-[#eef8f2] px-5 py-2 text-xs leading-5 text-success"
            role="status"
          >
            {bulkMessage}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-medium ${meta?.className}`}
          >
            <Icon aria-hidden="true" size={14} />
            {meta?.label}
          </span>
          {suggestion.factRisk !== "none" ? (
            <span className="inline-flex items-center gap-1 text-xs text-warning">
              <ShieldAlert aria-hidden="true" size={14} />
              事实风险 {riskLabel[suggestion.factRisk]}
            </span>
          ) : null}
          {suggestion.interviewRisk !== "none" ? (
            <span className="inline-flex items-center gap-1 text-xs text-danger">
              <CircleHelp aria-hidden="true" size={14} />
              面试追问风险 {riskLabel[suggestion.interviewRisk]}
            </span>
          ) : null}
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted">原文</p>
            <div className="mt-1.5 rounded-[8px] border border-line bg-[#f7f7f8] p-3">
              <p className="text-sm leading-6 text-ink">
                {suggestion.originalText || "此项为结构建议"}
              </p>
              {sourceDescription ? (
                <p className="mt-2 text-xs font-medium text-muted">
                  {sourceDescription}
                </p>
              ) : null}
            </div>
          </div>
          {suggestion.proposedText ? (
            <div>
              {editing ? (
                <>
                  <label
                    htmlFor={`manual-suggestion-${suggestion.id}`}
                    className="text-xs font-medium text-muted"
                  >
                    手动修改内容
                  </label>
                  <textarea
                    id={`manual-suggestion-${suggestion.id}`}
                    value={manualText}
                    onChange={(event) => setManualText(event.target.value)}
                    rows={5}
                    autoFocus
                    className="mt-1.5 w-full resize-y rounded-[8px] border border-brand bg-white p-3 text-sm leading-6 outline-none"
                  />
                  <p className="mt-2 text-xs leading-5 text-muted">
                    这里只调整已有事实的表达；新增数字、职责或结果应先走补事实流程。
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-muted">建议修改</p>
                  <p className="mt-1.5 rounded-[8px] border border-[#acd0fb] bg-[#f3f8ff] p-3 text-sm leading-6 text-ink">
                    {suggestion.proposedText}
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-5 border-l-2 border-brand pl-3">
          <p className="text-xs font-medium text-muted">
            AI 分析依据
          </p>
          <p className="mt-1 text-sm leading-6">{suggestion.rationale}</p>
        </div>

        {suggestion.affectedDimensions.length > 0 ? (
          <div className="mt-5">
            <p className="text-xs font-medium text-muted">影响评分</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestion.affectedDimensions.map((dimension) => (
                <span
                  key={dimension}
                  className="rounded-[6px] bg-[#f0f1f3] px-2 py-1 text-xs text-muted"
                >
                  {dimensionLabel[dimension] ?? dimension}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {evidenceLabels.length > 0 ? (
          <div className="mt-5">
            <p className="text-xs font-medium text-muted">证据状态</p>
            <ul className="mt-2 space-y-2">
              {evidenceLabels.map((claim) => (
                <li
                  key={claim.id}
                  className="flex items-start justify-between gap-3 rounded-[8px] bg-[#f7f7f8] px-3 py-2 text-xs leading-5"
                >
                  <span>{claim.text}</span>
                  <span
                    className={`shrink-0 rounded-[6px] px-2 py-0.5 font-medium ${claimStatusMeta[claim.status].className}`}
                  >
                    {claimStatusMeta[claim.status].label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t border-line bg-white px-5 py-4">
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                decideSuggestion(suggestion.id, "manual", manualText.trim());
                setEditing(false);
              }}
              disabled={!manualText.trim()}
              className="min-h-11 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf] disabled:opacity-40"
            >
              保存修改
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-11 rounded-[8px] px-4 text-sm font-medium text-muted hover:bg-[#f0f1f3]"
            >
              取消
            </button>
          </div>
        ) : suggestion.status !== "pending" ? (
          <p
            className="min-h-11 py-3 text-sm font-medium text-muted"
            role="status"
          >
            {suggestionStatusMessage(suggestion)}
          </p>
        ) : suggestion.kind === "needs_proof" ||
          suggestion.kind === "ask_user" ? (
          <div className="flex flex-wrap gap-2">
            <EvidenceDialog key={suggestion.id} suggestion={suggestion} />
            <button
              type="button"
              onClick={() => decideSuggestion(suggestion.id, "rejected")}
              className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line px-4 text-sm font-medium text-muted hover:bg-[#f0f1f3]"
            >
              <X aria-hidden="true" size={17} />
              跳过
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decideSuggestion(suggestion.id, "accepted")}
              className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf]"
            >
              <Check aria-hidden="true" size={17} />
              接受
            </button>
            <button
              type="button"
              onClick={() => decideSuggestion(suggestion.id, "rejected")}
              className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line px-4 text-sm font-medium text-muted hover:bg-[#f0f1f3]"
            >
              <X aria-hidden="true" size={17} />
              拒绝
            </button>
            {suggestion.proposedText ? (
              <button
                type="button"
                onClick={() => {
                  setManualText(suggestion.proposedText ?? "");
                  setEditing(true);
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-[8px] px-4 text-sm font-medium text-muted hover:bg-[#f0f1f3]"
              >
                <FilePenLine aria-hidden="true" size={17} />
                手动修改
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
