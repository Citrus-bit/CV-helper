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
import {
  aiAnalysisAvailable,
  analyzeResume,
  ApiError,
  loadDemoAnalysis,
} from "@/lib/client/api";
import { beginAnalysisRequest } from "@/lib/client/analysis-request";
import { useAppStore } from "@/lib/client/store";
import {
  hasFreshRequiredAiAnalysis,
  hasRequiredAiProvenance,
  isDemoTemplateAnalysis,
} from "@/lib/client/ai-analysis";
import { getRecentAnalysis } from "@/lib/client/recent-analysis";
import {
  getRetainedUploadFile,
  retainUploadFile,
} from "@/lib/client/retained-upload";
import {
  EstimatedProgressText,
  estimatedDurations,
} from "./estimated-progress";

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
  const [retryFile, setRetryFile] = useState<File | null>(() =>
    getRetainedUploadFile(),
  );
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [initialRecentLoadPending, setInitialRecentLoadPending] =
    useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const setStage = useAppStore((state) => state.setStage);
  const setAnalysis = useAppStore((state) => state.setAnalysis);
  const retryAiAnalysis = useAppStore((state) => state.retryAiAnalysis);
  const analysis = useAppStore((state) => state.analysis);
  const sourcePdfBlob = useAppStore((state) => state.sourcePdfBlob);
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
    hasRequiredAiProvenance(analysis) &&
    !recentAnalysesLoading &&
    !recentAnalyses.some(
      (record) =>
        record.id === analysis.resume.id &&
        record.resumeRevision === analysis.resume.revision &&
        record.isFreshAiAnalysis,
    ),
  );
  const hasLegacyCurrentAnalysis = Boolean(
    analysis &&
      !isDemoTemplateAnalysis(analysis) &&
      !hasRequiredAiProvenance(analysis),
  );

  useEffect(() => {
    const controller = new AbortController();
    void aiAnalysisAvailable(controller.signal).then(
      (available) => setAiAvailable(available),
      () => setAiAvailable(false),
    );
    return () => controller.abort();
  }, []);

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
    retainUploadFile(file);
    setRetryFile(file);
    if (aiAvailable !== true) {
      setError("AI 服务尚未配置，当前不会提供本地模板分析。");
      return;
    }
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
      retainUploadFile(null);
      setRetryFile(null);
      setAnalysis(analysis, file);
    } catch (requestError) {
      if (!request.settle()) return;
      if (isAbortError(requestError)) {
        setStage("upload");
        return;
      }
      setError(
        requestError instanceof ApiError && requestError.retryAfterSeconds
          ? `${requestError.message} 可在 ${requestError.retryAfterSeconds} 秒后重试。`
          : requestError instanceof Error
            ? requestError.message
            : "分析失败，请重试。",
      );
      setStage("upload");
    } finally {
      setBusy(false);
    }
  }

  async function reanalyzeRecent(id: string) {
    setOpeningId(id);
    setError(null);
    try {
      const record = await getRecentAnalysis(id);
      if (!record) {
        await refreshRecentSessions();
        setError("这条记录已过期或不存在。");
        return;
      }
      if (!record.pdfBlob) {
        setError("这条旧版本地分析没有保留原 PDF，请重新上传后使用 AI 分析。");
        inputRef.current?.click();
        return;
      }
      const file = new File([record.pdfBlob], record.originalFileName, {
        type: "application/pdf",
      });
      await submit(file);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "无法读取这条旧版本地分析。",
      );
    } finally {
      setOpeningId(null);
    }
  }

  function reanalyzeLegacyCurrent() {
    if (!analysis || !sourcePdfBlob) {
      setError("旧版本地分析没有可复用的原 PDF，请重新上传后使用 AI 分析。");
      inputRef.current?.click();
      return;
    }
    const file = new File([sourcePdfBlob], analysis.resume.originalFileName, {
      type: "application/pdf",
    });
    void submit(file);
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
    } finally {
      setBusy(false);
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
              从简历到岗位与面试
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 text-sm text-muted">
          <ShieldCheck aria-hidden="true" size={17} className="text-success" />
          匿名会话 · 24 小时到期
        </span>
      </div>

      <section
        className="mx-auto mt-14 w-full max-w-5xl"
        aria-labelledby="upload-title"
      >
        <div className="mb-7 max-w-2xl">
          <h2
            id="upload-title"
            className="text-[36px] font-semibold leading-tight"
          >
            上传简历，获得可投递版本
          </h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted">
            AI 会先找出最值得修改的内容，再生成一份可预览、可下载的新版简历。
          </p>
        </div>

        <div
          ref={dropZoneRef}
          role="region"
          aria-label="PDF 简历上传区"
          aria-busy={busy}
          data-ai-available={aiAvailable === true ? "true" : "false"}
          data-drag-active={dragging ? "true" : "false"}
          className={`relative grid min-h-[300px] place-items-center overflow-hidden rounded-[8px] border bg-surface px-6 py-9 shadow-panel transition-colors duration-200 ${
            dragging ? "border-brand bg-[#f3f8ff]" : "border-line"
          }`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDrop={(event) => {
            if (!isFileDrag(event)) return;
            event.preventDefault();
            resetDragState();
            const file = event.dataTransfer.files.item(0);
            if (file && aiAvailable === true) void submit(file);
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
              if (file && aiAvailable === true) void submit(file);
              event.target.value = "";
            }}
          />
          <div className="flex max-w-lg flex-col items-center text-center">
            <span className="pointer-events-none grid size-16 place-items-center rounded-full bg-[#edf5ff] text-brand">
              <Upload aria-hidden="true" size={28} />
            </span>
            <h3 className="mt-6 text-xl font-semibold" aria-live="polite">
              {dragging ? "松开即可开始" : "把 PDF 简历拖到这里"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              最多 5 页、10 MB，支持中文、英文和扫描件
            </p>
            <button
              type="button"
              disabled={busy || aiAvailable !== true}
              onClick={() => inputRef.current?.click()}
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#075bbf] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload aria-hidden="true" size={17} />
              上传简历
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadDemo()}
              className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-[8px] px-3 text-sm text-muted transition-colors hover:bg-[#f0f1f3] hover:text-ink disabled:opacity-50"
            >
              没有现成简历？查看示例
            </button>
          </div>
        </div>

        {error ? (
          <div
            className="mt-4 rounded-[8px] border border-[#f0b8b4] bg-[#fff7f6] px-4 py-3 text-sm text-danger"
            role="alert"
          >
            <p>{error}</p>
            {retryFile ? (
              <button
                type="button"
                disabled={busy || aiAvailable !== true}
                onClick={() => void submit(retryFile)}
                className="mt-3 min-h-11 rounded-[8px] bg-brand px-4 text-sm font-medium text-white disabled:opacity-45"
              >
                重新使用 AI 分析
              </button>
            ) : null}
          </div>
        ) : null}

        {aiAvailable === false && !error ? (
          <p
            className="mt-4 rounded-[8px] border border-[#f0b8b4] bg-[#fff7f6] px-4 py-3 text-sm text-danger"
            role="status"
          >
            AI 服务尚未配置，上传分析暂不可用；仍可查看本地体验示例。
          </p>
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
                {analysis.resume.originalFileName} ·{" "}
                {hasFreshRequiredAiAnalysis(analysis)
                  ? `AI 质量分 ${Math.round(analysis.scorecard.total)} · 尚未写入最近记录`
                  : "当前版本尚未完成 AI 分析，可继续编辑或重试"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStage("workspace");
                if (!hasFreshRequiredAiAnalysis(analysis)) {
                  retryAiAnalysis();
                }
              }}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-[#075bbf]"
            >
                {hasFreshRequiredAiAnalysis(analysis)
                  ? "继续当前分析"
                  : "继续并重试 AI"}
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          </aside>
        ) : null}

        {hasLegacyCurrentAnalysis && analysis ? (
          <aside className="mt-4 flex min-h-20 items-center justify-between gap-6 rounded-[8px] border border-[#ead59b] bg-[#fffaf0] px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">旧版本地分析</p>
              <p className="mt-1 text-sm text-muted">
                {analysis.resume.originalFileName} 的旧规则结果不会进入工作台，请重新使用 AI 分析。
              </p>
            </div>
            <button
              type="button"
              disabled={busy || aiAvailable !== true}
              onClick={reanalyzeLegacyCurrent}
              className="min-h-11 shrink-0 rounded-[8px] bg-brand px-4 text-sm font-medium text-white disabled:opacity-45"
            >
              {sourcePdfBlob ? "使用 AI 重新分析" : "重新上传 PDF"}
            </button>
          </aside>
        ) : null}

        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
          <LockKeyhole aria-hidden="true" size={16} className="text-success" />
          联系方式会在发送给 AI 前脱敏；不会替你编造经历和数字
        </p>
      </section>

      <section
        className={`mx-auto mt-10 w-full max-w-5xl ${
          recentAnalyses.length === 0 &&
          !initialRecentLoadPending &&
          !recentAnalysesLoading
            ? "hidden"
            : ""
        }`}
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
                      {clearing ? (
                        <span className="inline-flex items-center gap-2">
                          正在清空
                          <EstimatedProgressText
                            expectedDurationMs={estimatedDurations.localOperation}
                            label="清空本机记录预估进度"
                          />
                        </span>
                      ) : (
                        "确认清空"
                      )}
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
              <span>正在读取本机记录</span>{" "}
              <EstimatedProgressText
                expectedDurationMs={estimatedDurations.localOperation}
                label="本机记录读取预估进度"
              />
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
                      {!record.isFreshAiAnalysis ? (
                        <span className="shrink-0 rounded-[6px] bg-[#fff3d6] px-2 py-0.5 text-[11px] font-medium text-[#8a5a00]">
                          旧版本地分析
                        </span>
                      ) : null}
                      {!record.hasPdf ? (
                        <span className="shrink-0 rounded-[6px] bg-[#f0f1f3] px-2 py-0.5 text-[11px] text-muted">
                          PDF 已释放
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                      <span className="font-medium text-ink">
                        {record.isFreshAiAnalysis ? "AI 摘要" : "旧版规则摘要"}
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
                    {record.isFreshAiAnalysis ? (
                      <>
                        <p className="text-2xl font-semibold tabular-nums">
                          {Math.round(record.score)}
                        </p>
                        <p className="text-xs text-muted">
                          AI 质量分 · 待处理 {record.pendingSuggestionCount}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs leading-5 text-muted">
                        旧分数不作为<br />当前 AI 结论
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {deletingId === record.id ? (
                      <span className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted">
                        正在删除
                        <EstimatedProgressText
                          expectedDurationMs={estimatedDurations.localOperation}
                          label="本机记录删除预估进度"
                        />
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={openingId !== null || deletingId !== null}
                          onClick={() =>
                            record.isFreshAiAnalysis
                              ? void restoreRecent(record.id)
                              : void reanalyzeRecent(record.id)
                          }
                          className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {openingId === record.id ? (
                            <>
                              <span>正在恢复</span>
                              <EstimatedProgressText
                                expectedDurationMs={estimatedDurations.localOperation}
                                label="本机会话恢复预估进度"
                                className="text-white/85"
                              />
                            </>
                          ) : (
                            record.isFreshAiAnalysis
                              ? "继续分析"
                              : record.hasPdf
                                ? "使用 AI 重新分析"
                                : "重新上传 PDF"
                          )}
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
                      </>
                    )}
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
