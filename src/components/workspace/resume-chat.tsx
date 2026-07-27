"use client";

import {
  Bot,
  Check,
  ExternalLink,
  RotateCcw,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { sendResumeChatMessage } from "@/lib/client/api";
import {
  resumeChatInputForMessage,
  useAppStore,
} from "@/lib/client/store";
import type { Suggestion } from "@/lib/domain";
import type { ResumeChatMessage } from "@/lib/resume-chat";
import {
  EstimatedProgressText,
  estimatedDurations,
} from "../estimated-progress";

const starterPrompts = [
  "把工作经历写得更简洁，先告诉我你准备改哪几条。",
  "检查项目经历里最影响招聘者理解的表达，并给出可直接应用的修改。",
  "结合整份简历，帮我判断个人简介应该怎样调整。",
] as const;

function suggestionStatus(suggestion: Suggestion) {
  if (suggestion.status === "accepted" || suggestion.status === "manual") {
    return "已应用";
  }
  if (suggestion.status === "rejected") return "已跳过";
  if (suggestion.status === "stale") return "旧版本建议";
  if (suggestion.kind === "needs_proof" || suggestion.kind === "ask_user") {
    return "待补充事实";
  }
  return "可应用";
}

function ChatSuggestion({
  suggestion,
  onOpen,
  onApply,
}: {
  suggestion: Suggestion;
  onOpen: () => void;
  onApply: () => void;
}) {
  const canApply =
    suggestion.status === "pending" &&
    suggestion.kind !== "needs_proof" &&
    suggestion.kind !== "ask_user";

  return (
    <div className="border-t border-line py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-brand">
          {suggestionStatus(suggestion)}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[6px] px-2 text-xs font-medium text-muted transition-colors hover:bg-[#f0f1f3] hover:text-ink"
        >
          <ExternalLink aria-hidden="true" size={14} />
          逐条查看
        </button>
      </div>
      {suggestion.originalText ? (
        <p className="mt-2 text-xs leading-5 text-muted line-through decoration-[#c7c9ce]">
          {suggestion.originalText}
        </p>
      ) : null}
      {suggestion.proposedText ? (
        <p className="mt-1.5 text-sm leading-6 text-ink">
          {suggestion.proposedText}
        </p>
      ) : null}
      <p className="mt-1.5 text-xs leading-5 text-muted">
        {suggestion.rationale}
      </p>
      {canApply ? (
        <button
          type="button"
          onClick={onApply}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-[8px] bg-brand px-3 text-xs font-medium text-white transition-colors hover:bg-[#075bbf]"
        >
          <Check aria-hidden="true" size={15} />
          应用修改
        </button>
      ) : null}
    </div>
  );
}

function ChatMessage({
  message,
  suggestions,
  currentRevision,
}: {
  message: ResumeChatMessage;
  suggestions: Suggestion[];
  currentRevision: number;
}) {
  const decideSuggestion = useAppStore((state) => state.decideSuggestion);
  const selectSuggestion = useAppStore((state) => state.selectSuggestion);
  const setResumePanel = useAppStore((state) => state.setResumePanel);
  const [applyMessage, setApplyMessage] = useState("");
  const applicable = suggestions.filter(
    (suggestion) =>
      suggestion.status === "pending" &&
      suggestion.kind !== "needs_proof" &&
      suggestion.kind !== "ask_user",
  );

  function openSuggestion(id: string) {
    selectSuggestion(id);
    setResumePanel("suggestions");
  }

  function applyOne(id: string) {
    decideSuggestion(id, "accepted");
    setApplyMessage("修改已应用，可用顶部撤销恢复。");
  }

  function applyAll() {
    let count = 0;
    for (const suggestion of applicable) {
      const before = useAppStore
        .getState()
        .analysis?.suggestions.find((item) => item.id === suggestion.id)?.status;
      useAppStore.getState().decideSuggestion(suggestion.id, "accepted");
      const after = useAppStore
        .getState()
        .analysis?.suggestions.find((item) => item.id === suggestion.id)?.status;
      if (before === "pending" && after === "accepted") count += 1;
    }
    setApplyMessage(
      count > 0 ? `已应用 ${count} 条修改，可用顶部撤销恢复。` : "没有可应用的修改。",
    );
  }

  const oldRevision = message.resumeRevision !== currentRevision;
  const isUser = message.role === "user";
  const RoleIcon = isUser ? UserRound : Bot;

  return (
    <article
      className={`flex gap-3 ${isUser ? "ml-8 flex-row-reverse" : "mr-3"}`}
      aria-label={isUser ? "你的消息" : "AI 回复"}
    >
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-brand text-white" : "bg-[#eef1f5] text-ink"
        }`}
      >
        <RoleIcon aria-hidden="true" size={16} />
      </span>
      <div
        className={`min-w-0 max-w-[calc(100%-44px)] ${
          isUser
            ? "rounded-[8px] bg-brand px-3.5 py-2.5 text-white"
            : "flex-1 pt-1"
        }`}
      >
        {!isUser ? (
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted">
            <span>AI 编辑</span>
            {oldRevision ? (
              <span className="rounded-[5px] bg-[#fff7df] px-1.5 py-0.5 text-warning">
                基于版本 {message.resumeRevision + 1}
              </span>
            ) : null}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {message.content}
        </p>
        {!isUser && suggestions.length > 0 ? (
          <div className="mt-3 border-y border-line">
            {applicable.length > 1 ? (
              <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                <span className="text-xs text-muted">
                  {applicable.length} 条可应用修改
                </span>
                <button
                  type="button"
                  onClick={applyAll}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-[8px] bg-brand px-3 text-xs font-medium text-white hover:bg-[#075bbf]"
                >
                  <Check aria-hidden="true" size={15} />
                  全部应用
                </button>
              </div>
            ) : null}
            {suggestions.map((suggestion) => (
              <ChatSuggestion
                key={suggestion.id}
                suggestion={suggestion}
                onOpen={() => openSuggestion(suggestion.id)}
                onApply={() => applyOne(suggestion.id)}
              />
            ))}
          </div>
        ) : null}
        {applyMessage ? (
          <p className="mt-2 text-xs leading-5 text-success" role="status">
            {applyMessage}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function ResumeChat() {
  const analysis = useAppStore((state) => state.analysis)!;
  const context = useAppStore((state) => state.resumeChat);
  const beginResumeChatTurn = useAppStore(
    (state) => state.beginResumeChatTurn,
  );
  const completeResumeChatTurn = useAppStore(
    (state) => state.completeResumeChatTurn,
  );
  const clearResumeChat = useAppStore((state) => state.clearResumeChat);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [retryMessageId, setRetryMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestionsById = useMemo(
    () => new Map(analysis.suggestions.map((item) => [item.id, item])),
    [analysis.suggestions],
  );
  const messages = context?.messages ?? [];
  const confirmedFactCount = context?.confirmedFacts.length ?? 0;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  async function runTurn(messageId: string) {
    const state = useAppStore.getState();
    if (!state.analysis || !state.resumeChat) return;
    setSending(true);
    setError("");
    setRetryMessageId(null);
    try {
      const input = resumeChatInputForMessage(
        state.analysis,
        state.resumeChat,
        messageId,
      );
      const response = await sendResumeChatMessage(input);
      if (!completeResumeChatTurn(messageId, response)) {
        throw new Error("当前简历已切换，无法保存这轮 AI 回复。");
      }
    } catch (turnError) {
      setRetryMessageId(messageId);
      setError(
        turnError instanceof Error
          ? turnError.message
          : "AI 编辑未完成，请重试。",
      );
    } finally {
      setSending(false);
    }
  }

  function submit(content = draft) {
    if (sending) return;
    const message = beginResumeChatTurn(content);
    if (!message) return;
    setDraft("");
    void runTurn(message.id);
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-white"
      aria-labelledby="resume-chat-heading"
    >
      <header className="flex min-h-[58px] shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-2.5">
        <div className="min-w-0">
          <h2 id="resume-chat-heading" className="text-sm font-semibold">
            AI 编辑
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            版本 {analysis.resume.revision + 1} · {messages.length} 条消息
            {confirmedFactCount > 0 ? ` · ${confirmedFactCount} 条已确认事实` : ""}
          </p>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("清空当前简历的全部 AI 编辑对话？")) {
                clearResumeChat();
                setError("");
                setRetryMessageId(null);
              }
            }}
            disabled={sending}
            className="inline-flex min-h-11 items-center gap-2 rounded-[8px] px-3 text-xs font-medium text-muted transition-colors hover:bg-[#f0f1f3] hover:text-ink disabled:opacity-40"
          >
            <Trash2 aria-hidden="true" size={16} />
            清空
          </button>
        ) : null}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-5 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-md flex-col justify-center py-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Bot aria-hidden="true" size={18} className="text-brand" />
              从当前简历开始
            </div>
            <div className="mt-4 space-y-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submit(prompt)}
                  className="block min-h-11 w-full rounded-[8px] border border-line px-3 py-2.5 text-left text-sm leading-5 text-ink transition-colors hover:border-[#acd0fb] hover:bg-[#f7faff]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                currentRevision={analysis.resume.revision}
                suggestions={message.suggestionIds
                  .map((id) => suggestionsById.get(id))
                  .filter((item): item is Suggestion => Boolean(item))}
              />
            ))}
            {sending ? (
              <div
                className="mr-3 flex gap-3"
                aria-live="polite"
                aria-label="AI 正在处理"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef1f5] text-ink">
                  <Bot aria-hidden="true" size={16} />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-xs font-medium text-muted">AI 编辑</p>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-[8px] bg-[#f7f7f8] px-3 py-2.5 text-sm text-muted">
                    <span>正在结合当前简历与对话分析</span>
                    <EstimatedProgressText
                      expectedDurationMs={estimatedDurations.aiChat}
                      label="AI 编辑预估进度"
                      className="shrink-0 text-brand"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-white px-5 py-4">
        {error ? (
          <div
            className="mb-3 flex items-center justify-between gap-3 rounded-[8px] bg-[#fff0ef] px-3 py-2 text-xs leading-5 text-danger"
            role="alert"
          >
            <span>{error}</span>
            {retryMessageId ? (
              <button
                type="button"
                onClick={() => void runTurn(retryMessageId)}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-[8px] px-2 font-medium hover:bg-white/60"
              >
                <RotateCcw aria-hidden="true" size={14} />
                重试
              </button>
            ) : null}
          </div>
        ) : null}
        <label htmlFor="resume-chat-input" className="text-xs font-medium text-muted">
          继续修改
        </label>
        <div className="mt-2 flex items-end gap-2">
          <textarea
            id="resume-chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            rows={3}
            maxLength={4_000}
            disabled={sending}
            placeholder="说明你想分析或修改的内容"
            className="min-h-[72px] min-w-0 flex-1 resize-none rounded-[8px] border border-line bg-white px-3 py-2.5 text-sm leading-6 outline-none transition-colors focus:border-brand disabled:bg-[#f7f7f8]"
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={sending || !draft.trim()}
            aria-label="发送给 AI 编辑"
            title="发送"
            className="flex size-11 shrink-0 items-center justify-center rounded-[8px] bg-brand text-white transition-colors hover:bg-[#075bbf] disabled:opacity-40"
          >
            <Send aria-hidden="true" size={18} />
          </button>
        </div>
        <p className="mt-1.5 text-right text-[11px] tabular-nums text-muted">
          {draft.length}/4000
        </p>
      </div>
    </section>
  );
}
