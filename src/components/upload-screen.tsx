"use client";

import {
  ArrowRight,
  Clock3,
  FileSearch,
  FileText,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { analyzeResume, loadDemoAnalysis } from "@/lib/client/api";
import { beginAnalysisRequest } from "@/lib/client/analysis-request";
import { useAppStore } from "@/lib/client/store";

const MAX_BYTES = 10 * 1024 * 1024;

const parseMethodLabel = {
  native: "原生解析",
  mixed: "原生 + 局部 OCR",
  ocr: "OCR 解析",
} as const;

const updatedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function isAbortError(error: unknown) {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError")
  );
}

export function UploadScreen() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initialRecentLoadPending, setInitialRecentLoadPending] =
    useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const setStage = useAppStore((state) => state.setStage);
  const setAnalysis = useAppStore((state) => state.setAnalysis);
  const analysis = useAppStore((state) => state.analysis);
  const recentAnalyses = useAppStore((state) => state.recentAnalyses);
  const recentAnalysesLoading = useAppStore(
    (state) => state.recentAnalysesLoading,
  );
  const refreshRecentSessions = useAppStore(
    (state) => state.refreshRecentSessions,
  );
  const openRecentSession = useAppStore((state) => state.openRecentSession);
  const deleteRecentSession = useAppStore((state) => state.deleteRecentSession);
  const clearAllLocalData = useAppStore((state) => state.clearAllLocalData);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const hasUnarchivedCurrentAnalysis = Boolean(
    analysis &&
    !recentAnalysesLoading &&
    !recentAnalyses.some((record) => record.id === analysis.resume.id),
  );

  useEffect(() => {
    let active = true;
    void refreshRecentSessions().finally(() => {
      if (active) setInitialRecentLoadPending(false);
    });
    return () => {
      active = false;
    };
  }, [refreshRecentSessions]);

  useEffect(() => {
    const clearExternalDrag = () => {
      setDragging(false);
    };
    const isWindowFileDrag = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const trackWindowFileDrag = (event: DragEvent) => {
      if (!isWindowFileDrag(event)) return;
      event.preventDefault();
      const target = event.target;
      const zone = dropZoneRef.current;
      const rect = zone?.getBoundingClientRect();
      const isOverDropZone = Boolean(
        zone &&
        ((target instanceof Node && zone.contains(target)) ||
          (rect &&
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom)),
      );
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = isOverDropZone ? "copy" : "none";
      setDragging(isOverDropZone);
    };
    const handleWindowDragLeave = (event: DragEvent) => {
      if (!isWindowFileDrag(event)) return;
      const zone = dropZoneRef.current;
      const leavingTarget = event.target;
      if (
        zone &&
        leavingTarget instanceof Node &&
        zone.contains(leavingTarget)
      ) {
        return;
      }

      const nextTarget = event.relatedTarget;
      if (
        nextTarget instanceof Node &&
        document.documentElement.contains(nextTarget)
      ) {
        return;
      }

      const rect = zone?.getBoundingClientRect();
      const isStillOverDropZone = Boolean(
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      );

      // Child transitions and active-state renders can both emit dragleave.
      // Coordinates remain the source of truth until the pointer exits.
      if (isStillOverDropZone) return;
      clearExternalDrag();
    };
    const finishWindowDrop = (event: DragEvent) => {
      if (!isWindowFileDrag(event)) return;
      event.preventDefault();
      clearExternalDrag();
    };
    const cancelWindowDrag = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearExternalDrag();
    };

    window.addEventListener("dragend", clearExternalDrag);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("dragover", trackWindowFileDrag);
    window.addEventListener("drop", finishWindowDrop);
    window.addEventListener("blur", clearExternalDrag);
    window.addEventListener("keydown", cancelWindowDrag);
    return () => {
      window.removeEventListener("dragend", clearExternalDrag);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("dragover", trackWindowFileDrag);
      window.removeEventListener("drop", finishWindowDrop);
      window.removeEventListener("blur", clearExternalDrag);
      window.removeEventListener("keydown", cancelWindowDrag);
    };
  }, []);

  function isFileDrag(event: ReactDragEvent<HTMLDivElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    setDragging(true);
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function resetDragState() {
    setDragging(false);
  }

  async function submit(file: File) {
    setError(null);
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("请选择 PDF 文件。DOCX 和图片将在后续版本支持。");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("文件超过 10 MB，请压缩后重试。");
      return;
    }
    const request = beginAnalysisRequest();
    setBusy(true);
    setStage("analyzing");
    try {
      const analysis = await analyzeResume(file, request.signal);
      if (!request.settle()) return;
      setAnalysis(analysis, file);
    } catch (requestError) {
      if (!request.settle()) return;
      if (isAbortError(requestError)) {
        setStage("upload");
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "分析失败，请重试。",
      );
      setStage("upload");
    }
  }

  async function restoreRecent(id: string) {
    setOpeningId(id);
    try {
      await openRecentSession(id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "无法读取这条本机记录。",
      );
    } finally {
      setOpeningId(null);
    }
  }

  async function removeRecent(id: string) {
    setDeletingId(id);
    try {
      await deleteRecentSession(id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? `删除失败：${requestError.message}`
          : "删除失败，请重试。",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function clearLocalData() {
    setClearing(true);
    try {
      await clearAllLocalData();
      setClearDialogOpen(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? `清空未完成：${requestError.message}`
          : "清空未完成，请关闭页面后重试。",
      );
    } finally {
      setClearing(false);
    }
  }

  async function loadDemo() {
    setError(null);
    const request = beginAnalysisRequest();
    setBusy(true);
    setStage("analyzing");
    try {
      const analysis = await loadDemoAnalysis(request.signal);
      if (!request.settle()) return;
      setAnalysis(analysis);
    } catch (requestError) {
      if (!request.settle()) return;
      if (isAbortError(requestError)) {
        setStage("upload");
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "示例暂时无法加载。",
      );
      setStage("upload");
    }
  }

  return (
    <main className="min-h-dvh bg-canvas px-8 pb-12 pt-8">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-ink text-white shadow-panel">
            <FileSearch aria-hidden="true" size={22} />
          </span>
          <div className="min-w-0">
            <h1
              data-page-heading
              tabIndex={-1}
              className="truncate text-[20px] font-semibold leading-6 outline-none"
            >
              简历分析助手
            </h1>
            <p className="truncate text-sm text-muted">
              有证据约束的求职工作台
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 text-sm text-muted">
          <ShieldCheck aria-hidden="true" size={17} className="text-success" />
          匿名会话 · 24 小时到期
        </span>
      </div>

      <section
        className="mx-auto mt-20 w-full max-w-5xl"
        aria-labelledby="upload-title"
      >
        <div className="mb-7 max-w-2xl">
          <h2
            id="upload-title"
            className="text-[36px] font-semibold leading-tight"
          >
            从真实简历开始
          </h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted">
            数字 PDF 优先读取原生文字层；只有扫描页或缺失区块才会进入 OCR。
          </p>
        </div>

        <div
          ref={dropZoneRef}
          role="region"
          aria-label="PDF 简历上传区"
          aria-busy={busy}
          data-drag-active={dragging ? "true" : "false"}
          className={`relative grid min-h-[340px] place-items-center overflow-hidden rounded-[8px] border bg-surface px-6 py-10 shadow-panel transition-colors duration-200 ${
            dragging ? "border-brand bg-[#f3f8ff]" : "border-line"
          }`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDrop={(event) => {
            if (!isFileDrag(event)) return;
            event.preventDefault();
            resetDragState();
            const file = event.dataTransfer.files.item(0);
            if (file) void submit(file);
          }}
        >
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            tabIndex={-1}
            accept="application/pdf,.pdf"
            aria-label="选择 PDF 简历"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void submit(file);
              event.target.value = "";
            }}
          />
          <div className="flex max-w-lg flex-col items-center text-center">
            <span className="pointer-events-none grid size-16 place-items-center rounded-full bg-[#edf5ff] text-brand">
              <Upload aria-hidden="true" size={28} />
            </span>
            <h3 className="mt-6 text-xl font-semibold" aria-live="polite">
              {dragging ? "松开即可开始分析" : "拖入你的 PDF 简历"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              最多 5 页、10 MB，支持中文、英文和扫描件
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#075bbf] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload aria-hidden="true" size={17} />
              选择 PDF
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadDemo()}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[8px] px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-[#edf5ff] disabled:opacity-50"
            >
              体验示例
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        {error ? (
          <div
            className="mt-4 rounded-[8px] border border-[#f0b8b4] bg-[#fff7f6] px-4 py-3 text-sm text-danger"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {hasUnarchivedCurrentAnalysis && analysis ? (
          <aside
            className="mt-4 flex min-h-20 items-center justify-between gap-6 rounded-[8px] border border-[#b9d4f4] bg-[#f5f9ff] px-5 py-4"
            aria-labelledby="current-analysis-heading"
          >
            <div className="min-w-0">
              <p
                id="current-analysis-heading"
                className="text-sm font-semibold text-ink"
              >
                当前分析仍可继续
              </p>
              <p className="mt-1 truncate text-sm text-muted">
                {analysis.resume.originalFileName} · 质量分{" "}
                {Math.round(analysis.scorecard.total)}· 尚未写入最近记录
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStage("workspace");
              }}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-[#075bbf]"
            >
              继续当前分析
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          </aside>
        ) : null}

        <div className="mt-5 grid grid-cols-3 gap-3 text-sm text-muted">
          <p className="flex items-center gap-2">
            <FileSearch aria-hidden="true" size={17} className="text-brand" />
            原生解析优先
          </p>
          <p className="flex items-center gap-2">
            <LockKeyhole
              aria-hidden="true"
              size={17}
              className="text-warning"
            />
            本地处理，外部能力前脱敏
          </p>
          <p className="flex items-center gap-2">
            <ShieldCheck
              aria-hidden="true"
              size={17}
              className="text-success"
            />
            不编造经历与数字
          </p>
        </div>
      </section>

      <section
        className="mx-auto mt-12 w-full max-w-5xl"
        aria-labelledby="recent-heading"
      >
        <div className="flex min-h-11 items-center justify-between gap-6">
          <div>
            <h2 id="recent-heading" className="text-lg font-semibold">
              最近分析
            </h2>
            <p className="mt-1 text-sm text-muted">
              记录仅保存在这台电脑，最多 10 条；24 小时到期并在下次打开时清理。
            </p>
          </div>
          {recentAnalyses.length > 0 ? (
            <Dialog.Root
              open={clearDialogOpen}
              onOpenChange={setClearDialogOpen}
            >
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className="min-h-11 rounded-[8px] px-3 text-sm font-medium text-danger transition-colors hover:bg-[#fff0ef]"
                >
                  清空本机记录
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-white p-6 shadow-panel">
                  <Dialog.Title className="text-lg font-semibold">
                    清空全部本机记录？
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                    这会删除最近分析、当前会话和本地 PDF，且无法撤销。
                  </Dialog.Description>
                  <div className="mt-6 flex justify-end gap-2">
                    <Dialog.Close
                      disabled={clearing}
                      className="min-h-11 rounded-[8px] px-4 text-sm font-medium text-muted hover:bg-[#f0f1f3] disabled:opacity-45"
                    >
                      取消
                    </Dialog.Close>
                    <button
                      type="button"
                      disabled={clearing}
                      onClick={() => void clearLocalData()}
                      className="min-h-11 rounded-[8px] bg-danger px-4 text-sm font-medium text-white hover:bg-[#a82b26] disabled:opacity-45"
                    >
                      {clearing ? "正在清空" : "确认清空"}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          ) : null}
        </div>

        <div
          className="mt-4 overflow-hidden rounded-[8px] border border-line bg-white shadow-sm"
          aria-busy={initialRecentLoadPending || recentAnalysesLoading}
        >
          {recentAnalyses.length === 0 &&
          (initialRecentLoadPending || recentAnalysesLoading) ? (
            <p
              className="px-5 py-8 text-center text-sm text-muted"
              role="status"
            >
              正在读取本机记录…
            </p>
          ) : recentAnalyses.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              暂无最近分析
            </p>
          ) : (
            <div className="divide-y divide-line">
              {recentAnalyses.map((record) => (
                <article
                  key={record.id}
                  className="grid grid-cols-[minmax(0,1fr)_110px_164px] items-center gap-5 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText
                        aria-hidden="true"
                        size={17}
                        className="shrink-0 text-brand"
                      />
                      <h3 className="truncate text-sm font-semibold">
                        {record.originalFileName}
                      </h3>
                      {!record.hasPdf ? (
                        <span className="shrink-0 rounded-[6px] bg-[#f0f1f3] px-2 py-0.5 text-[11px] text-muted">
                          PDF 已释放
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                      <span className="font-medium text-ink">
                        {record.summarySource === "ai" ? "AI 摘要" : "规则摘要"}
                        ：
                      </span>
                      {record.summary}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Clock3 aria-hidden="true" size={13} />
                      {updatedAtFormatter.format(new Date(record.updatedAt))}
                      <span aria-hidden="true">·</span>
                      {parseMethodLabel[record.parseMethod]}
                      <span aria-hidden="true">·</span>
                      {record.pageCount} 页<span aria-hidden="true">·</span>
                      版本 {record.resumeRevision + 1}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold tabular-nums">
                      {Math.round(record.score)}
                    </p>
                    <p className="text-xs text-muted">
                      质量分 · 待处理 {record.pendingSuggestionCount}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={openingId !== null || deletingId !== null}
                      onClick={() => void restoreRecent(record.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {openingId === record.id ? "正在恢复" : "继续分析"}
                      <ArrowRight aria-hidden="true" size={16} />
                    </button>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          type="button"
                          aria-label={`删除 ${record.originalFileName} 的本机记录`}
                          disabled={openingId !== null || deletingId !== null}
                          onClick={() => void removeRecent(record.id)}
                          className="grid size-11 place-items-center rounded-[8px] text-muted transition-colors hover:bg-[#fff0ef] hover:text-danger disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Trash2 aria-hidden="true" size={18} />
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          side="bottom"
                          sideOffset={6}
                          className="z-50 rounded-[6px] bg-ink px-2.5 py-1.5 text-xs text-white shadow-panel"
                        >
                          删除本机记录
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
