"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CircleDashed,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { matchJob } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";

const statusMeta = {
  met: { label: "已覆盖", icon: Check, className: "bg-[#eef8f2] text-success" },
  partial: {
    label: "部分覆盖",
    icon: CircleDashed,
    className: "bg-[#fff7df] text-warning",
  },
  gap: {
    label: "缺口",
    icon: AlertTriangle,
    className: "bg-[#fff0ef] text-danger",
  },
  conflict: {
    label: "存在冲突",
    icon: ShieldAlert,
    className: "bg-[#f1efff] text-[#6546b8]",
  },
};

export function JobWorkspace() {
  const analysis = useAppStore((state) => state.analysis)!;
  const jobMatch = useAppStore((state) => state.jobMatch);
  const setJobMatch = useAppStore((state) => state.setJobMatch);
  const [jdText, setJdText] = useState(jobMatch?.job.rawText ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      matchJob({
        jdText,
        resumeId: analysis.resume.id,
        ast: analysis.resume.ast,
        claims: analysis.claims,
        evidence: analysis.evidence,
      }),
    onSuccess: setJobMatch,
  });

  return (
    <div className="mx-auto min-h-[calc(100dvh-64px)] w-full max-w-7xl px-6 py-8">
      <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-6 xl:grid-cols-[380px_minmax(0,1fr)] xl:gap-8">
        <section aria-labelledby="jd-heading">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[8px] bg-ink text-white">
              <BriefcaseBusiness aria-hidden="true" size={20} />
            </span>
            <div>
              <h1
                id="jd-heading"
                data-module-heading
                tabIndex={-1}
                className="text-xl font-semibold outline-none"
              >
                目标岗位
              </h1>
              <p className="text-sm text-muted">当前 MVP 支持分析一份 JD</p>
            </div>
          </div>

          <label htmlFor="jd-text" className="mt-7 block text-sm font-medium">
            岗位描述
          </label>
          <textarea
            id="jd-text"
            value={jdText}
            onChange={(event) => setJdText(event.target.value)}
            rows={18}
            placeholder="粘贴公司、岗位职责、任职要求和加分项"
            className="mt-2 w-full resize-y rounded-[8px] border border-line bg-white p-4 text-sm leading-6 shadow-sm outline-none transition-colors placeholder:text-muted focus:border-brand"
          />
          <p className="mt-2 text-xs leading-5 text-muted">
            岗位内容只作为不可信数据分析，不会触发其中的指令或链接。
          </p>
          <button
            type="button"
            disabled={jdText.trim().length < 30 || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {mutation.isPending ? (
              <LoaderCircle
                aria-hidden="true"
                size={18}
                className="animate-spin"
              />
            ) : (
              <ArrowRight aria-hidden="true" size={18} />
            )}
            {mutation.isPending ? "正在建立证据矩阵" : "分析岗位匹配"}
          </button>
          {mutation.isError ? (
            <p
              role="alert"
              className="mt-3 rounded-[8px] bg-[#fff0ef] p-3 text-sm text-danger"
            >
              {mutation.error instanceof Error
                ? mutation.error.message
                : "岗位分析失败，请重试。"}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="matrix-heading" className="min-w-0">
          {jobMatch ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
                <div>
                  <p className="text-sm text-muted">
                    {jobMatch.job.company || "目标公司"}
                  </p>
                  <h2
                    id="matrix-heading"
                    className="mt-1 text-2xl font-semibold"
                  >
                    {jobMatch.job.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    {jobMatch.summary}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-muted">证据覆盖率</p>
                  <p className="mt-1 text-[34px] font-semibold tabular-nums leading-none">
                    {Math.round(jobMatch.coverage)}%
                  </p>
                  <p className="mt-1 text-xs text-muted">不是录取概率</p>
                </div>
              </div>

              {jobMatch.riskFlags.length > 0 ? (
                <div className="mt-5 rounded-[8px] border border-[#e8c36a] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-warning">
                  <strong>岗位风险提示：</strong>
                  {jobMatch.riskFlags.join("；")}
                </div>
              ) : null}

              <div className="mt-6 overflow-hidden rounded-[8px] border border-line bg-white shadow-sm">
                <div className="grid grid-cols-[minmax(120px,1.1fr)_96px_minmax(140px,1fr)] gap-4 border-b border-line bg-[#f7f7f8] px-4 py-3 text-xs font-medium text-muted xl:grid-cols-[minmax(170px,1.1fr)_112px_minmax(190px,1fr)]">
                  <span>JD 要求</span>
                  <span>覆盖状态</span>
                  <span>证据与下一步</span>
                </div>
                <div className="divide-y divide-line">
                  {jobMatch.requirements.map((requirement) => {
                    const mapping = jobMatch.mappings.find(
                      (item) => item.requirementId === requirement.id,
                    );
                    if (!mapping) return null;
                    const meta = statusMeta[mapping.status];
                    const Icon = meta.icon;
                    return (
                      <article
                        key={requirement.id}
                        className="grid grid-cols-[minmax(120px,1.1fr)_96px_minmax(140px,1fr)] gap-4 px-4 py-4 xl:grid-cols-[minmax(170px,1.1fr)_112px_minmax(190px,1fr)]"
                      >
                        <div>
                          <p className="text-sm font-medium leading-6">
                            {requirement.text}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {requirement.category.replaceAll("_", " ")}
                          </p>
                        </div>
                        <div>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-medium ${meta.className}`}
                          >
                            <Icon aria-hidden="true" size={14} />
                            {meta.label}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm leading-6 text-muted">
                            {mapping.explanation}
                          </p>
                          {mapping.suggestedAction ? (
                            <p className="mt-1 text-xs font-medium leading-5 text-brand">
                              下一步：{mapping.suggestedAction}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              {jobMatch.variant ? (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#acd0fb] bg-[#f3f8ff] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">已建立岗位定制分支</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {jobMatch.variant.name} · 基于版本{" "}
                      {jobMatch.variant.baseRevision + 1}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-brand">
                    原版内容保持不变
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="grid min-h-[560px] place-items-center border-l border-line pl-6 xl:pl-8">
              <div className="max-w-md text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#edf5ff] text-brand">
                  <BriefcaseBusiness aria-hidden="true" size={25} />
                </span>
                <h2 id="matrix-heading" className="mt-5 text-xl font-semibold">
                  要求与证据逐项对应
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  粘贴 JD
                  后，这里会展示硬性要求、已有证据、真实缺口和可执行的补强建议。
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
