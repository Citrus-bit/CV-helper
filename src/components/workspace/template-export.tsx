"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  Download,
  FileOutput,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import {
  EstimatedProgressText,
  estimatedDurations,
} from "../estimated-progress";
import { downloadVerifiedResume, renderResume } from "@/lib/client/api";
import { useAppStore, type TemplateId } from "@/lib/client/store";
import type { AuditCheck } from "@/lib/domain";

const auditStatusLabel = {
  pass: "通过",
  warn: "警告",
  fail: "失败",
} as const;

export function exportConfirmationBlocker(input: {
  hasOriginalPdf: boolean;
  hardGatePassed: boolean;
  downloadable: boolean;
  astContentCovered: boolean;
  previewed: boolean;
  blockingChecks?: readonly AuditCheck[];
}) {
  if (!input.hasOriginalPdf) return "请先重新附加原 PDF，再进行最终对照确认。";
  if (!input.hardGatePassed || !input.downloadable || !input.astContentCovered) {
    const blockingCheck = input.blockingChecks?.find(
      (check) => check.status === "fail",
    );
    if (blockingCheck)
      return `后台自动排版未通过“${blockingCheck.label}”，请重新生成。`;
    return "后台未能生成通过完整性检查的 PDF，请重新生成。";
  }
  if (!input.previewed) return "等待新版 PDF 预览完成像素验证后确认。";
  return null;
}

export function TemplateExport() {
  const analysis = useAppStore((state) => state.analysis)!;
  const jobVariant = useAppStore((state) => state.jobMatch?.variant);
  const activeResumeVariantId = useAppStore(
    (state) => state.activeResumeVariantId,
  );
  const selectedTemplate = useAppStore((state) => state.selectedTemplate);
  const renders = useAppStore((state) => state.renders);
  const previewedRenderHashes = useAppStore(
    (state) => state.previewedRenderHashes,
  );
  const setRender = useAppStore((state) => state.setRender);
  const [confirmedRenderKey, setConfirmedRenderKey] = useState<string | null>(
    null,
  );
  const activeVariant =
    jobVariant?.id === activeResumeVariantId ? jobVariant : null;
  const target = activeVariant
    ? {
        id: activeVariant.id,
        revision: activeVariant.revision,
        ast: activeVariant.ast,
        name: activeVariant.name,
      }
    : {
        id: analysis.resume.id,
        revision: analysis.resume.revision,
        ast: analysis.resume.ast,
        name: "通用版",
      };

  const mutation = useMutation({
    mutationFn: (template: TemplateId) =>
      renderResume({
        resumeId: target.id,
        revision: target.revision,
        ast: target.ast,
        template,
      }),
    onSuccess: setRender,
  });

  function renderForTarget(template: TemplateId) {
    const render = renders[template];
    return render &&
      render.report.resumeId === target.id &&
      render.report.resumeRevision === target.revision &&
      render.report.template === render.template &&
      render.report.artifactSha256 === render.sha256
      ? render
      : undefined;
  }

  const current = renderForTarget(selectedTemplate);
  const renderKey = current
    ? `${current.report.resumeId}:${current.report.resumeRevision}:${selectedTemplate}:${current.sha256}`
    : null;
  const confirmed = renderKey !== null && confirmedRenderKey === renderKey;
  const previewed = current
    ? previewedRenderHashes.includes(current.sha256)
    : false;
  const confirmationBlocker = current
    ? exportConfirmationBlocker({
        hasOriginalPdf: Boolean(analysis.originalPdfBase64),
        hardGatePassed: current.hardGate.passed,
        downloadable: current.report.downloadable,
        astContentCovered: current.astContentCovered,
        previewed,
        blockingChecks: current.report.checks.filter((check) =>
          current.hardGate.blockingCheckIds.includes(check.id),
        ),
      })
    : "请先生成最终 PDF。";
  const canConfirm = confirmationBlocker === null;
  const passedCheckCount = current
    ? current.report.checks.filter((check) => check.status === "pass").length
    : 0;
  const auditNeedsAttention = current
    ? current.report.checks.some((check) => check.status !== "pass")
    : false;
  const warningCount = current
    ? current.report.checks.filter((check) => check.status === "warn").length
    : 0;

  const downloadMutation = useMutation({
    mutationFn: () => {
      if (!current) throw new Error("当前没有可下载的 PDF。");
      return downloadVerifiedResume({
        revision: current.report.resumeRevision,
        template: selectedTemplate,
        render: current,
      });
    },
  });
  const templateSelectionLocked =
    mutation.isPending || downloadMutation.isPending;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="template-heading"
    >
      <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-line px-5 py-2.5">
        <div className="min-w-0">
          <h2 id="template-heading" className="text-sm font-semibold">
            导出 PDF
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted">
            {target.name} · 版本 {target.revision + 1}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted">自动排版</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {!current ? (
          <div
            className="flex items-center gap-3 text-xs leading-5 text-muted"
            role="status"
          >
            <FileOutput aria-hidden="true" size={19} className="shrink-0" />
            <p>
              <strong className="font-medium text-ink">
                最终 PDF 尚未生成
              </strong>
              <span className="block">生成时会自动完成排版与导出检查。</span>
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  aria-hidden="true"
                  size={18}
                  className={
                    current.report.downloadable ? "text-success" : "text-danger"
                  }
                />
                <div>
                  <p className="text-sm font-semibold">
                    PDF 导出检查 {Math.round(current.report.overallScore)} / 100
                  </p>
                  <p className="text-xs text-muted">
                    {current.report.pageCount} 页 · {passedCheckCount}/
                    {current.report.checks.length} 项通过
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="重新生成最终 PDF"
                onClick={() => mutation.mutate(selectedTemplate)}
                disabled={templateSelectionLocked}
                className="grid size-11 place-items-center rounded-[8px] text-muted hover:bg-[#f0f1f3] disabled:opacity-40"
              >
                <RefreshCw
                  aria-hidden="true"
                  size={17}
                  className={mutation.isPending ? "animate-spin" : ""}
                />
              </button>
            </div>
            {mutation.isPending ? (
              <p className="mt-2 flex items-center justify-end gap-2 text-xs text-muted">
                <span>正在重新生成</span>
                <EstimatedProgressText
                  expectedDurationMs={estimatedDurations.pdfGeneration}
                  label="PDF 重新生成预估进度"
                />
              </p>
            ) : null}
            <details
              key={current.sha256}
              open={auditNeedsAttention || undefined}
              className="group mt-3 overflow-hidden rounded-[8px] border border-line"
            >
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-medium text-ink transition-colors hover:bg-[#f7f7f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
                <span>查看质量检查明细</span>
                <ChevronDown
                  aria-hidden="true"
                  size={16}
                  className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <ul className="space-y-2 border-t border-line px-3 py-3 text-xs">
                {current.report.checks.map((check) => (
                  <li key={check.id} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${check.status === "pass" ? "bg-success text-white" : check.status === "warn" ? "bg-warning text-white" : "bg-danger text-white"}`}
                    >
                      {check.status === "pass"
                        ? "✓"
                        : check.status === "warn"
                          ? "!"
                          : "×"}
                    </span>
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                      <span className="sr-only">
                        状态：{auditStatusLabel[check.status]}。
                      </span>
                      <strong>{check.label}</strong>
                      {check.details ? `：${check.details}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

        {mutation.isError ? (
          <p
            className="mt-4 rounded-[8px] bg-[#fff0ef] p-3 text-xs leading-5 text-danger"
            role="alert"
          >
            {mutation.error instanceof Error
              ? mutation.error.message
              : "PDF 生成失败，请重试。"}
          </p>
        ) : null}
        {downloadMutation.isError ? (
          <p
            className="mt-4 rounded-[8px] bg-[#fff0ef] p-3 text-xs leading-5 text-danger"
            role="alert"
          >
            {downloadMutation.error instanceof Error
              ? downloadMutation.error.message
              : "下载复核失败，请重新生成。"}
          </p>
        ) : null}
      </div>

      <div className="border-t border-line bg-[#fafafa] px-5 py-3.5">
        {current ? (
          <>
            <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-line bg-white px-3 py-2.5 text-xs leading-5 text-ink">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!canConfirm || templateSelectionLocked}
                onChange={(event) =>
                  setConfirmedRenderKey(event.target.checked ? renderKey : null)
                }
                className="mt-0.5 size-4 shrink-0 accent-[#0969da] disabled:cursor-not-allowed"
              />
              <span className={canConfirm ? "" : "text-muted"}>
                {canConfirm
                  ? warningCount > 0
                    ? `已查看预览，确认在 ${warningCount} 项提示下下载当前文件。`
                    : "已对照原版，确认下载当前最终版本。"
                  : confirmationBlocker}
              </span>
            </label>
            <button
              type="button"
              disabled={
                !confirmed ||
                !canConfirm ||
                mutation.isPending ||
                downloadMutation.isPending
              }
              onClick={() => downloadMutation.mutate()}
              className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-medium ${
                confirmed && canConfirm && !mutation.isPending
                  ? "bg-brand text-white hover:bg-[#075bbf]"
                  : "cursor-not-allowed border border-line bg-white text-muted"
              }`}
            >
              {downloadMutation.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <Download aria-hidden="true" size={17} />
              )}
              {downloadMutation.isPending ? (
                <>
                  <span>正在校验文件</span>
                </>
              ) : (
                "下载最终 PDF"
              )}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(selectedTemplate)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-[#075bbf] disabled:cursor-wait disabled:opacity-55"
          >
            {mutation.isPending ? (
              <LoaderCircle
                aria-hidden="true"
                size={17}
                className="animate-spin"
              />
            ) : (
              <FileOutput aria-hidden="true" size={17} />
            )}
            {mutation.isPending ? (
              <>
                <span>正在自动排版</span>
                <EstimatedProgressText
                  expectedDurationMs={estimatedDurations.pdfGeneration}
                  label="PDF 生成预估进度"
                  className="text-white/85"
                />
              </>
            ) : (
              "生成最终 PDF"
            )}
          </button>
        )}
      </div>
    </section>
  );
}
