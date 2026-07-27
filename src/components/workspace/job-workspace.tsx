"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CircleDashed,
  Database,
  FileOutput,
  LoaderCircle,
  Quote,
  ShieldAlert,
} from "lucide-react";
import { matchJob } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import {
  EstimatedProgressText,
  estimatedDurations,
} from "../estimated-progress";

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

const requirementCategoryLabel = {
  must_have: "硬性要求",
  responsibility: "岗位职责",
  skill: "技能要求",
  nice_to_have: "加分项",
  constraint: "岗位限制",
} as const;

const claimStatusLabel = {
  resume_only: "简历原文",
  user_confirmed: "用户已确认",
  supported: "已有证据",
  needs_evidence: "待补证据",
  conflicting: "存在冲突",
} as const;

const seniorityOptions = [
  { value: "", zh: "不指定", en: "Not specified" },
  { value: "intern", zh: "实习", en: "Internship" },
  { value: "entry", zh: "初级 / 应届", en: "Entry level" },
  { value: "mid", zh: "中级", en: "Mid level" },
  { value: "senior", zh: "高级 / 资深", en: "Senior" },
  { value: "lead", zh: "负责人 / 专家", en: "Lead" },
  { value: "executive", zh: "总监及以上", en: "Executive" },
] as const;

export function JobWorkspace() {
  const analysis = useAppStore((state) => state.analysis)!;
  const jobDraft = useAppStore((state) => state.jobDraft);
  const updateJobDraft = useAppStore((state) => state.updateJobDraft);
  const jobMatch = useAppStore((state) => state.jobMatch);
  const setJobMatch = useAppStore((state) => state.setJobMatch);
  const activeResumeVariantId = useAppStore(
    (state) => state.activeResumeVariantId,
  );
  const setResumeVariant = useAppStore((state) => state.setResumeVariant);
  const setResumePanel = useAppStore((state) => state.setResumePanel);
  const setPreviewMode = useAppStore((state) => state.setPreviewMode);
  const setModule = useAppStore((state) => state.setModule);

  const mutation = useMutation({
    mutationFn: () => {
      const seniority = seniorityOptions.find(
        (option) => option.value === jobDraft.seniority,
      );
      return matchJob({
        jdText: jobDraft.jdText,
        jobTitle: jobDraft.jobTitle.trim() || undefined,
        seniority:
          jobDraft.seniority === ""
            ? undefined
            : jobDraft.language === "en-US"
              ? seniority?.en
              : seniority?.zh,
        location: jobDraft.location.trim() || undefined,
        language: jobDraft.language,
        resumeId: analysis.resume.id,
        ast: analysis.resume.ast,
        claims: analysis.claims,
        evidence: analysis.evidence,
      });
    },
    onSuccess: setJobMatch,
  });

  function openResumeVersion(variantId: string | null) {
    setResumeVariant(variantId);
    setResumePanel("templates");
    setPreviewMode("current");
    setModule("resume");
  }

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

          <fieldset disabled={mutation.isPending} className="mt-7">
            <legend className="text-sm font-medium">岗位信息（可选）</legend>
            <p className="mt-1 text-xs leading-5 text-muted">
              填写后会校正 JD 自动解析结果，并用于岗位版命名。
            </p>
            <label
              htmlFor="job-title"
              className="mt-4 block text-xs font-medium text-ink"
            >
              职位名称
            </label>
            <input
              id="job-title"
              value={jobDraft.jobTitle}
              maxLength={120}
              readOnly={mutation.isPending}
              onChange={(event) =>
                updateJobDraft({ jobTitle: event.target.value })
              }
              placeholder="例如：高级产品经理"
              className="mt-1.5 min-h-11 w-full rounded-[8px] border border-line bg-white px-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted focus:border-brand read-only:cursor-wait read-only:bg-[#f7f7f8]"
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-ink">
                职级
                <select
                  value={jobDraft.seniority}
                  onChange={(event) =>
                    updateJobDraft({
                      seniority: event.target
                        .value as typeof jobDraft.seniority,
                    })
                  }
                  className="mt-1.5 min-h-11 w-full rounded-[8px] border border-line bg-white px-3 text-sm font-normal shadow-sm outline-none transition-colors focus:border-brand disabled:cursor-wait disabled:bg-[#f7f7f8]"
                >
                  {seniorityOptions.map((option) => (
                    <option
                      key={option.value || "unspecified"}
                      value={option.value}
                    >
                      {option.zh}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-ink">
                求职语言
                <select
                  value={jobDraft.language}
                  onChange={(event) =>
                    updateJobDraft({
                      language: event.target.value as "zh-CN" | "en-US",
                    })
                  }
                  className="mt-1.5 min-h-11 w-full rounded-[8px] border border-line bg-white px-3 text-sm font-normal shadow-sm outline-none transition-colors focus:border-brand disabled:cursor-wait disabled:bg-[#f7f7f8]"
                >
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                </select>
              </label>
            </div>
            <label
              htmlFor="job-location"
              className="mt-3 block text-xs font-medium text-ink"
            >
              工作地点
            </label>
            <input
              id="job-location"
              value={jobDraft.location}
              maxLength={160}
              readOnly={mutation.isPending}
              onChange={(event) =>
                updateJobDraft({ location: event.target.value })
              }
              placeholder="例如：上海 / 远程"
              className="mt-1.5 min-h-11 w-full rounded-[8px] border border-line bg-white px-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted focus:border-brand read-only:cursor-wait read-only:bg-[#f7f7f8]"
            />
          </fieldset>

          <label htmlFor="jd-text" className="mt-5 block text-sm font-medium">
            岗位描述
          </label>
          <textarea
            id="jd-text"
            value={jobDraft.jdText}
            readOnly={mutation.isPending}
            maxLength={60_000}
            onChange={(event) => updateJobDraft({ jdText: event.target.value })}
            rows={12}
            placeholder="粘贴公司、岗位职责、任职要求和加分项"
            className="mt-2 w-full resize-y rounded-[8px] border border-line bg-white p-4 text-sm leading-6 shadow-sm outline-none transition-colors placeholder:text-muted focus:border-brand read-only:cursor-wait read-only:bg-[#f7f7f8]"
          />
          <p className="mt-2 text-xs leading-5 text-muted">
            岗位内容只作为不可信数据分析，不会触发其中的指令或链接。
          </p>
          <button
            type="button"
            disabled={jobDraft.jdText.trim().length < 30 || mutation.isPending}
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
            {mutation.isPending ? (
              <>
                <span>正在建立证据矩阵</span>
                <EstimatedProgressText
                  expectedDurationMs={estimatedDurations.jobMatch}
                  label="岗位匹配预估进度"
                  className="text-white/85"
                />
              </>
            ) : (
              "分析岗位匹配"
            )}
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
                    const mappedClaims = mapping.claimIds
                      .map((claimId) =>
                        analysis.claims.find((claim) => claim.id === claimId),
                      )
                      .filter((claim) => claim !== undefined);
                    const evidenceIds = new Set([
                      ...mapping.evidenceAssetIds,
                      ...mappedClaims.flatMap(
                        (claim) => claim.evidenceAssetIds,
                      ),
                    ]);
                    const mappedEvidence = [...evidenceIds]
                      .map((evidenceId) =>
                        analysis.evidence.find(
                          (evidence) => evidence.id === evidenceId,
                        ),
                      )
                      .filter((evidence) => evidence !== undefined);
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
                            {requirementCategoryLabel[requirement.category]}
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
                          {mappedClaims.length > 0 ? (
                            <div className="mt-3 border-l-2 border-[#b9d8fb] pl-3">
                              <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                                <Quote aria-hidden="true" size={14} />
                                对应简历声明
                              </p>
                              <ul className="mt-1.5 space-y-2">
                                {mappedClaims.map((claim) => (
                                  <li
                                    key={claim.id}
                                    className="text-xs leading-5 text-muted"
                                  >
                                    <q>{claim.text}</q>
                                    <span className="ml-1.5 whitespace-nowrap text-[11px] font-medium text-ink">
                                      {claimStatusLabel[claim.status]}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {mappedEvidence.length > 0 ? (
                            <div className="mt-3 border-l-2 border-[#b9dfc8] pl-3">
                              <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                                <Database aria-hidden="true" size={14} />
                                可核对证据
                              </p>
                              <ul className="mt-1.5 space-y-2">
                                {mappedEvidence.map((evidence) => (
                                  <li
                                    key={evidence.id}
                                    className="text-xs leading-5 text-muted"
                                  >
                                    <strong className="font-medium text-ink">
                                      {evidence.label}：
                                    </strong>
                                    {evidence.content}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
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
                <div className="mt-5 rounded-[8px] border border-[#acd0fb] bg-[#f3f8ff] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">岗位版已生成</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted">
                        {jobMatch.variant.name} · 基于通用版{" "}
                        {jobMatch.variant.baseRevision + 1} · 仅调整已有内容顺序
                      </p>
                    </div>
                    <span className="rounded-[6px] bg-white px-2.5 py-1 text-xs font-medium text-brand">
                      {jobMatch.variant.changes.length} 项可审计变更
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-xs leading-5 text-muted">
                    {jobMatch.variant.changes.map((change) => (
                      <li key={change.id} className="flex gap-2">
                        <Check
                          aria-hidden="true"
                          size={14}
                          className="mt-0.5 shrink-0 text-success"
                        />
                        <span>{change.explanation}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openResumeVersion(jobMatch.variant!.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-[#075bbf]"
                    >
                      <FileOutput aria-hidden="true" size={17} />
                      {activeResumeVariantId === jobMatch.variant.id
                        ? "继续查看岗位版"
                        : "打开岗位版预览"}
                      <ArrowUpRight aria-hidden="true" size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openResumeVersion(null)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-[#f7f7f8]"
                    >
                      打开通用版
                    </button>
                  </div>
                </div>
              ) : jobMatch.variantUnavailableReason ? (
                <div className="mt-5 rounded-[8px] border border-line bg-[#f7f7f8] px-4 py-3">
                  <p className="text-sm font-semibold">本次未生成岗位版</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {jobMatch.variantUnavailableReason}
                  </p>
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
