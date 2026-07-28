"use client";

import {
  ArrowLeft,
  BriefcaseBusiness,
  CircleAlert,
  FileCheck2,
  Mic2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useEffect, useRef, useState } from "react";
import { useAppStore, type WorkspaceModule } from "@/lib/client/store";
import {
  EstimatedProgressText,
  estimatedDurations,
} from "../estimated-progress";
import { ResumeWorkspace } from "./resume-workspace";
import { JobWorkspace } from "./job-workspace";
import { InterviewWorkspace } from "./interview-workspace";

const navigation: Array<{
  id: WorkspaceModule;
  label: string;
  icon: typeof FileCheck2;
}> = [
  { id: "resume", label: "简历优化", icon: FileCheck2 },
  { id: "job", label: "岗位匹配", icon: BriefcaseBusiness },
  { id: "interview", label: "模拟面试", icon: Mic2 },
];

function Navigation({
  pendingSuggestionCount,
  aiReady,
}: {
  pendingSuggestionCount: number;
  aiReady: boolean;
}) {
  const activeModule = useAppStore((state) => state.module);
  const setModule = useAppStore((state) => state.setModule);
  const advanceLocked = !aiReady;
  return (
      <nav
        aria-label="求职准备流程"
        className="flex items-center rounded-[8px] bg-[#f0f1f3] p-1"
      >
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.id;
          const disabled = item.id !== "resume" && advanceLocked;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              disabled={disabled}
              onClick={() => setModule(item.id)}
              className={`flex min-h-10 min-w-[128px] items-center justify-center gap-2 rounded-[6px] px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                active
                  ? "bg-white text-ink shadow-sm"
                  : "text-muted hover:text-ink disabled:hover:text-muted"
              }`}
            >
              <Icon aria-hidden="true" size={19} />
              <span>{item.label}</span>
              {item.id === "resume" && pendingSuggestionCount > 0 ? (
                <span className="rounded-full bg-[#e3efff] px-1.5 text-[11px] font-semibold text-brand">
                  {pendingSuggestionCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
  );
}

export function Workspace() {
  const activeModule = useAppStore((state) => state.module);
  const analysis = useAppStore((state) => state.analysis)!;
  const pendingSuggestionCount = analysis.suggestions.filter(
    (suggestion) => suggestion.status === "pending",
  ).length;
  const aiReady = Boolean(
    analysis.processing.aiAnalysis?.status === "fresh" &&
      analysis.processing.aiAnalysis.analyzedRevision ===
        analysis.resume.revision,
  );
  const undoStack = useAppStore((state) => state.undoStack);
  const undo = useAppStore((state) => state.undo);
  const goHome = useAppStore((state) => state.goHome);
  const goHomeWithoutArchive = useAppStore(
    (state) => state.goHomeWithoutArchive,
  );
  const deleteRecentSession = useAppStore((state) => state.deleteRecentSession);
  const reset = useAppStore((state) => state.reset);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const homeNavigationPending = useAppStore(
    (state) => state.homeNavigationPending,
  );
  const workspaceContentRef = useRef<HTMLDivElement>(null);
  const previousModuleRef = useRef(activeModule);
  const [deletingCurrent, setDeletingCurrent] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const archiveSaveFailed = error?.startsWith("无法安全保存当前会话");

  async function deleteCurrentSession() {
    setDeletingCurrent(true);
    setDeleteError(null);
    try {
      await deleteRecentSession(analysis.resume.id);
      reset();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? `删除失败：${error.message}`
          : "删除失败，请重试。",
      );
    } finally {
      setDeletingCurrent(false);
    }
  }

  useEffect(() => {
    if (previousModuleRef.current === activeModule) return;
    previousModuleRef.current = activeModule;
    const frame = window.requestAnimationFrame(() => {
      workspaceContentRef.current
        ?.querySelector<HTMLElement>("[data-module-heading]")
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeModule]);

  return (
    <main
      className="h-dvh overflow-hidden bg-canvas"
      aria-busy={homeNavigationPending}
    >
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3"
      >
        跳到主要内容
      </a>

      <div className="flex h-dvh min-h-0 flex-col">
        <header className="z-10 grid h-16 min-h-16 shrink-0 grid-cols-[minmax(180px,1fr)_auto_minmax(96px,1fr)] items-center border-b border-line bg-white/95 px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={() => void goHome()}
                  aria-label="返回首页并保存当前分析"
                  disabled={homeNavigationPending}
                  className="grid size-11 shrink-0 place-items-center rounded-[8px] text-muted transition-colors hover:bg-[#f0f1f3] hover:text-ink"
                >
                  <ArrowLeft aria-hidden="true" size={19} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="bottom"
                  sideOffset={6}
                  className="z-50 rounded-[6px] bg-ink px-2.5 py-1.5 text-xs text-white shadow-panel"
                >
                  返回首页（自动保存）
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {analysis.resume.originalFileName}
              </p>
              <p className="text-xs text-muted">
                版本 {analysis.resume.revision + 1} ·{" "}
                {analysis.resume.pageCount} 页
              </p>
            </div>
          </div>
          <Navigation
            pendingSuggestionCount={pendingSuggestionCount}
            aiReady={aiReady}
          />
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              disabled={undoStack.length === 0}
              onClick={undo}
              title="撤销上一次修改"
              aria-label="撤销上一次修改"
              className="grid size-11 place-items-center rounded-[8px] text-muted transition-colors hover:bg-[#f0f1f3] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
            >
              <RotateCcw aria-hidden="true" size={19} />
            </button>
            <Dialog.Root>
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  title="删除当前会话"
                  aria-label="删除当前会话"
                  className="grid size-11 place-items-center rounded-[8px] text-muted transition-colors hover:bg-[#fff0ef] hover:text-danger"
                >
                  <Trash2 aria-hidden="true" size={19} />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-white p-6 shadow-panel">
                  <Dialog.Title className="text-lg font-semibold">
                    删除当前会话？
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                    简历、分析结果和面试记录将从此设备清除。
                  </Dialog.Description>
                  <div className="mt-6 flex justify-end gap-2">
                    <Dialog.Close className="min-h-11 rounded-[8px] px-4 text-sm font-medium text-muted hover:bg-[#f0f1f3]">
                      取消
                    </Dialog.Close>
                    <button
                      type="button"
                      disabled={deletingCurrent}
                      onClick={() => void deleteCurrentSession()}
                      className="min-h-11 rounded-[8px] bg-danger px-4 text-sm font-medium text-white hover:bg-[#a82b26]"
                    >
                      {deletingCurrent ? (
                        <span className="inline-flex items-center gap-2">
                          正在删除
                          <EstimatedProgressText
                            expectedDurationMs={estimatedDurations.localOperation}
                            label="当前会话删除预估进度"
                          />
                        </span>
                      ) : (
                        "删除"
                      )}
                    </button>
                  </div>
                  {deleteError ? (
                    <p className="mt-3 text-sm text-danger" role="alert">
                      {deleteError}
                    </p>
                  ) : null}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </header>

        {error ? (
          <div
            className="mx-6 mt-4 flex shrink-0 items-center gap-3 rounded-[8px] border border-[#f0b8b4] bg-[#fff7f6] px-4 py-3 text-sm"
            role="alert"
          >
            <CircleAlert
              aria-hidden="true"
              size={19}
              className="shrink-0 text-danger"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">
                {archiveSaveFailed ? "无法保存到最近记录" : "操作未完成"}
              </p>
              <p className="mt-0.5 leading-5 text-danger">{error}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {archiveSaveFailed ? (
                <>
                  <button
                    type="button"
                    onClick={() => void goHome()}
                    className="min-h-11 rounded-[8px] px-3 text-sm font-medium text-brand transition-colors hover:bg-[#edf5ff]"
                  >
                    重试保存
                  </button>
                  <button
                    type="button"
                    onClick={goHomeWithoutArchive}
                    className="min-h-11 rounded-[8px] bg-ink px-4 text-sm font-medium text-white transition-colors hover:bg-[#343438]"
                  >
                    不归档，返回首页
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="min-h-11 rounded-[8px] px-3 text-sm font-medium text-ink transition-colors hover:bg-[#f0f1f3]"
                >
                  关闭
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div
          ref={workspaceContentRef}
          id="workspace-content"
          tabIndex={-1}
          className={`relative h-0 min-h-0 flex-1 overscroll-contain ${
            activeModule === "resume" ? "overflow-hidden" : "overflow-auto"
          }`}
        >
          {activeModule === "resume" ? <ResumeWorkspace /> : null}
          {activeModule === "job" ? <JobWorkspace /> : null}
          {activeModule === "interview" ? <InterviewWorkspace /> : null}
        </div>
      </div>
      {homeNavigationPending ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-white/55 backdrop-blur-[2px]"
          role="status"
        >
          <span className="inline-flex min-w-64 items-center justify-between gap-3 rounded-[8px] bg-white px-4 py-3 text-sm font-medium shadow-panel">
            <span>正在保存当前会话</span>
            <EstimatedProgressText
              expectedDurationMs={estimatedDurations.localOperation}
              label="当前会话保存预估进度"
            />
          </span>
        </div>
      ) : null}
    </main>
  );
}
