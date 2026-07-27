"use client";

import * as Tabs from "@radix-ui/react-tabs";
import {
  BriefcaseBusiness,
  FilePenLine,
  LayoutTemplate,
  MessagesSquare,
} from "lucide-react";
import { useState } from "react";
import { DocumentPreview } from "./document-preview";
import { ScorePanel } from "./score-panel";
import { SuggestionReview } from "./suggestion-review";
import { ResumeChat } from "./resume-chat";
import { ResumeContentEditor } from "./resume-content-editor";
import { TemplateExport } from "./template-export";
import { useAppStore, type ResumePanel } from "@/lib/client/store";

export function ResumeWorkspace() {
  const analysis = useAppStore((state) => state.analysis)!;
  const jobVariant = useAppStore((state) => state.jobMatch?.variant);
  const activeResumeVariantId = useAppStore(
    (state) => state.activeResumeVariantId,
  );
  const setResumeVariant = useAppStore((state) => state.setResumeVariant);
  const resumePanel = useAppStore((state) => state.resumePanel);
  const setResumePanel = useAppStore((state) => state.setResumePanel);
  const retryAiAnalysis = useAppStore((state) => state.retryAiAnalysis);
  const [mountedPanels, setMountedPanels] = useState<Set<ResumePanel>>(
    () => new Set([resumePanel]),
  );
  const viewingJobVariant = Boolean(
    jobVariant && activeResumeVariantId === jobVariant.id,
  );
  const templateTargetKey = viewingJobVariant
    ? `${jobVariant!.id}:${jobVariant!.revision}`
    : `${analysis.resume.id}:${analysis.resume.revision}`;
  const aiStatus = analysis.processing.aiAnalysis?.status ?? "failed";
  const aiFresh =
    aiStatus === "fresh" &&
    analysis.processing.aiAnalysis?.analyzedRevision ===
      analysis.resume.revision;

  function changePanel(value: string) {
    const panel = value as ResumePanel;
    setMountedPanels((current) =>
      current.has(resumePanel) && current.has(panel)
        ? current
        : new Set([...current, resumePanel, panel]),
    );
    setResumePanel(panel);
  }

  function changeVariant(variantId: string | null) {
    setMountedPanels((current) =>
      current.has(resumePanel) && current.has("templates")
        ? current
        : new Set([...current, resumePanel, "templates"]),
    );
    setResumeVariant(variantId);
  }

  return (
    <div className="absolute inset-0 grid min-h-0 grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:grid-cols-[minmax(480px,1.25fr)_minmax(390px,0.75fr)]">
      <h1 data-module-heading tabIndex={-1} className="sr-only">
        简历优化
      </h1>
      <DocumentPreview />
      <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-line bg-white">
        {jobVariant ? (
          <div className="shrink-0 border-b border-line px-4 py-2.5">
            <div
              className="grid grid-cols-2 rounded-[8px] bg-[#f0f1f3] p-1"
              aria-label="简历版本"
            >
              <button
                type="button"
                aria-pressed={!viewingJobVariant}
                onClick={() => changeVariant(null)}
                className={`min-h-10 rounded-[6px] px-3 text-xs font-medium transition-colors ${
                  !viewingJobVariant
                    ? "bg-white text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                通用版
              </button>
              <button
                type="button"
                aria-pressed={viewingJobVariant}
                onClick={() => changeVariant(jobVariant.id)}
                className={`flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-[6px] px-3 text-xs font-medium transition-colors ${
                  viewingJobVariant
                    ? "bg-white text-brand shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                <BriefcaseBusiness
                  aria-hidden="true"
                  size={14}
                  className="shrink-0"
                />
                <span className="truncate">{jobVariant.name}</span>
              </button>
            </div>
            {viewingJobVariant ? (
              <p className="mt-1.5 text-center text-[11px] leading-4 text-muted">
                仅重排已有内容 · 修改建议仍作用于通用版
              </p>
            ) : null}
          </div>
        ) : null}
        {aiFresh ? (
          <ScorePanel
            scorecard={analysis.scorecard}
            atsAudit={analysis.atsAudit}
            sourceBlocks={analysis.resume.sourceBlocks}
          />
        ) : (
          <div className="shrink-0 border-b border-line bg-[#f7f7f8] px-5 py-4 text-sm leading-6 text-muted" role="status">
            <p>
              {aiStatus === "failed"
                ? "当前版本的 AI 评分未完成，旧分数不会作为当前结论展示。"
                : "当前版本正在进行 AI 分析，完成前不展示旧分数。"}
            </p>
            {aiStatus === "failed" ? (
              <button
                type="button"
                onClick={retryAiAnalysis}
                className="mt-3 min-h-11 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf]"
              >
                重新进行 AI 分析
              </button>
            ) : null}
          </div>
        )}
        <div className="shrink-0 border-b border-line px-4 py-3">
          <ResumeContentEditor />
        </div>
        <Tabs.Root
          value={resumePanel}
          onValueChange={changePanel}
          className="flex min-h-0 flex-1 flex-col"
        >
          <Tabs.List
            className="mx-4 my-3 grid h-10 shrink-0 grid-cols-3 rounded-[8px] bg-[#eff0f2] p-1"
            aria-label="简历审阅视图"
          >
            <Tabs.Trigger
              value="suggestions"
              className="flex min-w-0 items-center justify-center gap-2 rounded-[6px] px-3 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm"
            >
              <FilePenLine aria-hidden="true" size={17} />
              修改建议
            </Tabs.Trigger>
            <Tabs.Trigger
              value="chat"
              className="flex min-w-0 items-center justify-center gap-1.5 rounded-[6px] px-2 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm"
            >
              <MessagesSquare aria-hidden="true" size={16} />
              AI 编辑
            </Tabs.Trigger>
            <Tabs.Trigger
              value="templates"
              className="flex min-w-0 items-center justify-center gap-2 rounded-[6px] px-3 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm"
            >
              <LayoutTemplate aria-hidden="true" size={17} />
              排版预览
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content
            value="suggestions"
            {...(mountedPanels.has("suggestions")
              ? { forceMount: true as const }
              : {})}
            style={{ display: resumePanel === "suggestions" ? "flex" : "none" }}
            className="hidden min-h-0 flex-1 flex-col outline-none data-[state=active]:flex"
          >
            <SuggestionReview />
          </Tabs.Content>
          <Tabs.Content
            value="chat"
            {...(mountedPanels.has("chat")
              ? { forceMount: true as const }
              : {})}
            style={{ display: resumePanel === "chat" ? "flex" : "none" }}
            className="hidden min-h-0 flex-1 flex-col outline-none data-[state=active]:flex"
          >
            <ResumeChat />
          </Tabs.Content>
          <Tabs.Content
            value="templates"
            {...(mountedPanels.has("templates")
              ? { forceMount: true as const }
              : {})}
            style={{ display: resumePanel === "templates" ? "flex" : "none" }}
            className="hidden min-h-0 flex-1 flex-col outline-none data-[state=active]:flex"
          >
            <TemplateExport key={templateTargetKey} />
          </Tabs.Content>
        </Tabs.Root>
      </aside>
    </div>
  );
}
