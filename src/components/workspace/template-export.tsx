"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Download, FileOutput, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { downloadVerifiedResume, recommendLayout, renderResume } from "@/lib/client/api";
import { useAppStore, type TemplateId } from "@/lib/client/store";

const templates: Array<{ id: TemplateId; name: string; description: string }> = [
  { id: "professional", name: "Professional", description: "层级清晰，适合大多数岗位" },
  { id: "minimal", name: "Minimal", description: "留白舒展，适合经历较精炼的简历" },
  { id: "compact", name: "Compact", description: "信息紧凑，适合项目与经历较多的候选人" },
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

export function TemplateExport() {
  const analysis = useAppStore((state) => state.analysis)!;
  const selectedTemplate = useAppStore((state) => state.selectedTemplate);
  const setTemplate = useAppStore((state) => state.setTemplate);
  const renders = useAppStore((state) => state.renders);
  const previewedRenderHashes = useAppStore((state) => state.previewedRenderHashes);
  const setRender = useAppStore((state) => state.setRender);
  const [confirmedRenderKey, setConfirmedRenderKey] = useState<string | null>(null);

  const recommendation = useQuery({
    queryKey: ["layout-recommendation", analysis.resume.id, analysis.resume.revision],
    queryFn: () =>
      recommendLayout({
        ast: analysis.resume.ast,
        targetPages: Math.min(2, Math.max(1, analysis.resume.pageCount)),
      }),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (template: TemplateId) =>
      renderResume({
        resumeId: analysis.resume.id,
        revision: analysis.resume.revision,
        ast: analysis.resume.ast,
        template,
        sourcePageCount: analysis.resume.pageCount,
      }),
    onSuccess: setRender,
  });

  const current = renders[selectedTemplate];
  const renderKey = current
    ? `${current.report.resumeId}:${current.report.resumeRevision}:${selectedTemplate}:${current.sha256}`
    : null;
  const confirmed = renderKey !== null && confirmedRenderKey === renderKey;
  const previewed = current ? previewedRenderHashes.includes(current.sha256) : false;
  const canConfirm = Boolean(
    current?.hardGate.passed &&
      current.report.downloadable &&
      current.astContentCovered &&
      previewed,
  );

  const downloadMutation = useMutation({
    mutationFn: () => {
      if (!current) throw new Error("当前没有可下载的 PDF。");
      return downloadVerifiedResume({
        resumeId: analysis.resume.id,
        revision: current.report.resumeRevision,
        ast: analysis.resume.ast,
        template: selectedTemplate,
        render: current,
        sourcePageCount: analysis.resume.pageCount,
      });
    },
  });

  function choose(template: TemplateId) {
    setTemplate(template);
    if (!renders[template]) mutation.mutate(template);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="template-heading">
      <div className="border-b border-line px-5 py-4">
        <h2 id="template-heading" className="text-sm font-semibold">排版预览与导出</h2>
        <p className="mt-1 text-xs leading-5 text-muted">预览和下载来自同一份真实 PDF。</p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        {recommendation.data ? (
          <p className="mb-4 text-xs leading-5 text-muted" role="status">
            推荐 <strong className="text-ink">{templates.find((item) => item.id === recommendation.data.recommendedTemplate)?.name}</strong>
            {` · ${densityLabel[recommendation.data.density]} · 预计 ${recommendation.data.estimatedPages} 页`}
          </p>
        ) : null}
        <div className="space-y-2">
          {templates.map((template) => {
            const active = selectedTemplate === template.id;
            const generated = renders[template.id];
            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={active}
                onClick={() => choose(template.id)}
                className={`flex min-h-[68px] w-full items-center justify-between gap-4 rounded-[8px] border px-3 py-2 text-left transition-colors ${
                  active ? "border-brand bg-[#f3f8ff]" : "border-line hover:bg-[#f7f7f8]"
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold">{template.name}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">{template.description}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {recommendation.data?.recommendedTemplate === template.id ? (
                    <span className="rounded-[6px] bg-[#eef8f2] px-2 py-1 text-[11px] font-medium text-success">推荐</span>
                  ) : null}
                  {generated ? <Check aria-label="已生成" size={18} className="text-success" /> : <FileOutput aria-hidden="true" size={18} className="text-muted" />}
                </span>
              </button>
            );
          })}
        </div>

        {!current ? (
          <div className="mt-5 rounded-[8px] border border-dashed border-line p-5 text-center">
            <FileOutput aria-hidden="true" size={27} className="mx-auto text-muted" />
            <p className="mt-2 text-sm font-medium">生成 {templates.find((item) => item.id === selectedTemplate)?.name} 预览</p>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(selectedTemplate)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf] disabled:opacity-50"
            >
              {mutation.isPending ? <LoaderCircle aria-hidden="true" size={17} className="animate-spin" /> : <FileOutput aria-hidden="true" size={17} />}
              {mutation.isPending ? "正在编译" : "生成真实 PDF"}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" size={18} className={current.report.downloadable ? "text-success" : "text-danger"} />
                <div>
                  <p className="text-sm font-semibold">导出质量 {Math.round(current.report.overallScore)} / 100</p>
                  <p className="text-xs text-muted">{current.report.pageCount} 页 · revision {current.report.resumeRevision}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="重新生成预览"
                onClick={() => mutation.mutate(selectedTemplate)}
                disabled={mutation.isPending}
                className="grid size-11 place-items-center rounded-[8px] text-muted hover:bg-[#f0f1f3] disabled:opacity-40"
              >
                <RefreshCw aria-hidden="true" size={17} className={mutation.isPending ? "animate-spin" : ""} />
              </button>
            </div>
            <ul className="mt-4 space-y-2 text-xs">
              {current.report.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2">
                  <span aria-hidden="true" className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${check.status === "pass" ? "bg-success text-white" : check.status === "warn" ? "bg-warning text-white" : "bg-danger text-white"}`}>
                    {check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "×"}
                  </span>
                  <span>
                    <span className="sr-only">状态：{auditStatusLabel[check.status]}。</span>
                    <strong>{check.label}</strong>{check.details ? `：${check.details}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[8px] bg-[#f7f7f8] p-3 text-xs leading-5">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!canConfirm}
                onChange={(event) => setConfirmedRenderKey(event.target.checked ? renderKey : null)}
                className="mt-0.5 size-4 accent-[#0969da] disabled:cursor-not-allowed"
              />
              {previewed ? "我已对照原版预览，并确认使用当前模板作为最终版本。" : "等待新版 PDF 预览加载后确认。"}
            </label>
          </div>
        )}

        {mutation.isError ? (
          <p className="mt-4 rounded-[8px] bg-[#fff0ef] p-3 text-xs leading-5 text-danger" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : "PDF 生成失败，请重试。"}
          </p>
        ) : null}
        {downloadMutation.isError ? (
          <p className="mt-4 rounded-[8px] bg-[#fff0ef] p-3 text-xs leading-5 text-danger" role="alert">
            {downloadMutation.error instanceof Error ? downloadMutation.error.message : "下载复核失败，请重新生成。"}
          </p>
        ) : null}
      </div>

      <div className="border-t border-line bg-white px-5 py-4">
        {current ? (
          <button
            type="button"
            disabled={!confirmed || !canConfirm || downloadMutation.isPending}
            onClick={() => downloadMutation.mutate()}
            className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-medium ${
              confirmed && canConfirm ? "bg-brand text-white hover:bg-[#075bbf]" : "cursor-not-allowed bg-[#e5e6e8] text-[#898990]"
            }`}
          >
            {downloadMutation.isPending ? <LoaderCircle aria-hidden="true" size={17} className="animate-spin" /> : <Download aria-hidden="true" size={17} />}
            {downloadMutation.isPending ? "正在复核" : "下载最终 PDF"}
          </button>
        ) : (
          <p className="text-center text-xs text-muted">生成并确认预览后可下载</p>
        )}
      </div>
    </section>
  );
}
