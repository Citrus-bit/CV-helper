"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  FileOutput,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import {
  downloadVerifiedResume,
  recommendLayout,
  renderResume,
} from "@/lib/client/api";
import { useAppStore, type TemplateId } from "@/lib/client/store";

const templates: Array<{ id: TemplateId; name: string; description: string }> =
  [
    {
      id: "professional",
      name: "Professional",
      description: "层级清晰，适合大多数岗位",
    },
    {
      id: "minimal",
      name: "Minimal",
      description: "留白舒展，适合经历较精炼的简历",
    },
    {
      id: "compact",
      name: "Compact",
      description: "信息紧凑，适合项目与经历较多的候选人",
    },
  ];

const auditStatusLabel = {
  pass: "通过",
  warn: "警告",
  fail: "失败",
} as const;

const densityLabel = {
  light: "精简内容",
  balanced: "均衡密度",
  dense: "高信息密度",
} as const;

export function exportConfirmationBlocker(input: {
  hasOriginalPdf: boolean;
  hardGatePassed: boolean;
  downloadable: boolean;
  astContentCovered: boolean;
  previewed: boolean;
}) {
  if (!input.hasOriginalPdf) return "请先重新附加原 PDF，再进行最终对照确认。";
  if (!input.hardGatePassed || !input.downloadable || !input.astContentCovered)
    return "当前版本未通过导出质量门，请重新生成或调整内容。";
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
  const setTemplate = useAppStore((state) => state.setTemplate);
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

  const recommendation = useQuery({
    queryKey: ["layout-recommendation", target.id, target.revision],
    queryFn: () =>
      recommendLayout({
        ast: target.ast,
        targetPages: Math.min(2, Math.max(1, analysis.resume.pageCount)),
      }),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (template: TemplateId) =>
      renderResume({
        resumeId: target.id,
        revision: target.revision,
        ast: target.ast,
        template,
        sourcePageCount: analysis.resume.pageCount,
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
  const selectedTemplateMeta = templates.find(
    (template) => template.id === selectedTemplate,
  )!;
  const recommendedTemplateMeta = recommendation.data
    ? templates.find(
        (template) => template.id === recommendation.data.recommendedTemplate,
      )
    : null;
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
      })
    : "请先生成当前模板的真实 PDF。";
  const canConfirm = confirmationBlocker === null;
  const passedCheckCount = current
    ? current.report.checks.filter((check) => check.status === "pass").length
    : 0;
  const auditNeedsAttention = current
    ? current.report.checks.some((check) => check.status !== "pass")
    : false;

  const downloadMutation = useMutation({
    mutationFn: () => {
      if (!current) throw new Error("当前没有可下载的 PDF。");
      return downloadVerifiedResume({
        resumeId: target.id,
        revision: current.report.resumeRevision,
        ast: target.ast,
        template: selectedTemplate,
        render: current,
        sourcePageCount: analysis.resume.pageCount,
      });
    },
  });
  const templateSelectionLocked =
    mutation.isPending || downloadMutation.isPending;

  function choose(template: TemplateId) {
    if (templateSelectionLocked) return;
    setTemplate(template);
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="template-heading"
    >
      <div className="border-b border-line px-5 py-3.5">
        <h2 id="template-heading" className="text-sm font-semibold">
          排版预览与导出
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          正在处理{target.name}，预览和下载来自同一份真实 PDF。
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {recommendation.data ? (
          <div
            className="mb-4 flex items-start gap-2.5 rounded-[8px] border border-[#cfe2f8] bg-[#f5f9fe] px-3 py-2.5 text-xs leading-5"
            aria-label="排版推荐"
          >
            <Sparkles
              aria-hidden="true"
              size={16}
              className="mt-0.5 shrink-0 text-brand"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">
                推荐 {recommendedTemplateMeta?.name}
                <span className="font-normal text-muted">
                  {` · ${densityLabel[recommendation.data.density]} · ${recommendation.data.estimatedPages} 页`}
                </span>
              </p>
              {recommendation.data.reasons[0] ? (
                <p className="mt-0.5 text-muted">
                  {recommendation.data.reasons[0]}
                </p>
              ) : null}
            </div>
            {recommendedTemplateMeta?.id !== selectedTemplate ? (
              <button
                type="button"
                disabled={templateSelectionLocked}
                onClick={() => choose(recommendation.data.recommendedTemplate)}
                className="min-h-10 shrink-0 rounded-[6px] px-2.5 font-medium text-brand transition-colors hover:bg-[#e6f1fd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45"
              >
                选用
              </button>
            ) : null}
          </div>
        ) : recommendation.isError ? (
          <div
            className="mb-4 flex items-center gap-2 rounded-[8px] bg-[#fff7df] px-3 py-2 text-xs leading-5 text-[#72510b]"
            role="alert"
          >
            <CircleAlert aria-hidden="true" size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">暂时无法计算模板推荐。</span>
            <button
              type="button"
              onClick={() => void recommendation.refetch()}
              className="min-h-9 shrink-0 rounded-[6px] px-2 font-medium hover:bg-[#f8edcf]"
            >
              重试
            </button>
          </div>
        ) : (
          <p className="mb-4 text-xs leading-5 text-muted" role="status">
            正在计算模板与密度建议…
          </p>
        )}
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-ink">排版模板</p>
            <p className="text-[11px] text-muted">
              当前：{selectedTemplateMeta.name}
            </p>
          </div>
          <div
            className="mt-2 grid grid-cols-3 gap-1 rounded-[8px] bg-[#eff0f2] p-1"
            role="group"
            aria-label="简历排版模板"
          >
            {templates.map((template) => {
              const active = selectedTemplate === template.id;
              const generated = renderForTarget(template.id);
              const recommended =
                recommendation.data?.recommendedTemplate === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={active}
                  disabled={templateSelectionLocked}
                  onClick={() => choose(template.id)}
                  className={`min-h-[54px] min-w-0 rounded-[6px] px-1.5 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-55 ${
                    active
                      ? "bg-white text-brand shadow-sm"
                      : "text-muted hover:bg-white/65 hover:text-ink"
                  }`}
                >
                  <span className="block truncate text-xs font-semibold">
                    {template.name}
                  </span>
                  <span
                    className={`mt-0.5 block min-h-4 text-[11px] leading-4 ${recommended ? "text-success" : "text-muted"}`}
                  >
                    {recommended ? "推荐" : generated ? "已生成" : "\u00a0"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex min-h-8 items-start justify-between gap-3 px-1 text-xs leading-5">
            <p className="min-w-0 text-muted">
              {selectedTemplateMeta.description}
            </p>
            <span
              className={`inline-flex shrink-0 items-center gap-1 font-medium ${current ? "text-success" : "text-muted"}`}
            >
              {current ? <Check aria-hidden="true" size={14} /> : null}
              {current ? "已生成" : "待生成"}
            </span>
          </div>
        </div>

        {!current ? (
          <div
            className="mt-4 flex items-center gap-3 border-t border-line pt-4 text-xs leading-5 text-muted"
            role="status"
          >
            <FileOutput aria-hidden="true" size={19} className="shrink-0" />
            <p>
              <strong className="font-medium text-ink">
                {selectedTemplateMeta.name} 尚未生成
              </strong>
              <span className="block">生成后将进入导出质量检查。</span>
            </p>
          </div>
        ) : (
          <div className="mt-4 border-t border-line pt-4">
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
                    导出质量 {Math.round(current.report.overallScore)} / 100
                  </p>
                  <p className="text-xs text-muted">
                    {current.report.pageCount} 页 · {passedCheckCount}/
                    {current.report.checks.length} 项通过
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="重新生成预览"
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
                  ? "已对照原版，确认将当前模板用于最终下载。"
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
              {downloadMutation.isPending ? "正在复核" : "下载最终 PDF"}
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
            {mutation.isPending
              ? `正在生成 ${selectedTemplateMeta.name}`
              : `生成 ${selectedTemplateMeta.name} PDF`}
          </button>
        )}
      </div>
    </section>
  );
}
