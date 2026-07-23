import { z } from "zod";

import { getCapabilityDescriptor, type Capability, type CapabilityExecution, type CapabilityId } from "@/lib/capabilities";
import type {
  AnswerEvaluation,
  Claim,
  EvidenceAsset,
  InterviewQuestion,
  ScoreDimension,
  Suggestion,
} from "@/lib/domain";

import {
  AnswerCoachInputSchema,
  AnswerCoachOutputSchema,
  AnswerEvaluateInputSchema,
  AnswerEvaluateOutputSchema,
  ClaimAssessInputSchema,
  ClaimAssessOutputSchema,
  ClaimConflictInputSchema,
  ClaimConflictOutputSchema,
  CopyConsistencyInputSchema,
  CopyConsistencyOutputSchema,
  CopyRewriteInputSchema,
  CopyRewriteOutputSchema,
  EvidenceMineInputSchema,
  EvidenceMineOutputSchema,
  InterviewPlanInputSchema,
  InterviewPlanOutputSchema,
  JdParseInputSchema,
  JdParseOutputSchema,
  JobMatchInputSchema,
  JobMatchOutputSchema,
  JobRiskDetectInputSchema,
  JobRiskDetectOutputSchema,
  PiiRedactInputSchema,
  PiiRedactOutputSchema,
  PromptGuardInputSchema,
  PromptGuardOutputSchema,
  QuestionRetrieveInputSchema,
  QuestionRetrieveOutputSchema,
  ResumeAtsAuditInputSchema,
  ResumeAtsAuditOutputSchema,
  ResumeInterviewCheckInputSchema,
  ResumeInterviewCheckOutputSchema,
  ResumeScoreInputSchema,
  ResumeScoreOutputSchema,
  ResumeSuggestInputSchema,
  ResumeSuggestOutputSchema,
  StoryBuildInputSchema,
  StoryBuildOutputSchema,
  type AnswerCoachInput,
  type AnswerEvaluateInput,
  type ClaimAssessInput,
  type ClaimConflictInput,
  type CopyConsistencyInput,
  type CopyRewriteInput,
  type EvidenceMineInput,
  type InterviewPlanInput,
  type JdParseInput,
  type JobMatchInput,
  type JobRiskDetectInput,
  type PiiRedactInput,
  type PromptGuardInput,
  type QuestionRetrieveInput,
  type ResumeAtsAuditInput,
  type ResumeInterviewCheckInput,
  type ResumeScoreInput,
  type ResumeSuggestInput,
  type StoryBuildInput,
} from "./contracts";
import { claimParts, clamp, excerpt, extractKeywords, keywordOverlap, normalizeText, numericTokens, round, splitStatements, stableId, unwrapUntrustedDocumentText, wrapUntrustedDocumentText } from "./utils";
import { DOCUMENT_AND_EXPORT_CAPABILITIES } from "./document-capabilities";
import { PLATFORM_BASELINE_CAPABILITIES } from "./platform-capabilities";

function defineCapability<I, O>(
  id: CapabilityId,
  inputSchema: z.ZodType<I>,
  outputSchema: z.ZodType<O>,
  execute: (input: I) => CapabilityExecution<O>,
): Capability<I, O> {
  return { descriptor: getCapabilityDescriptor(id), inputSchema, outputSchema, execute };
}

function allResumeLines(input: EvidenceMineInput["resume"]): Array<{ text: string; sourceBlockIds: string[] }> {
  const lines: Array<{ text: string; sourceBlockIds: string[] }> = [];
  if (input.ast.summary) lines.push({ text: input.ast.summary, sourceBlockIds: [] });
  for (const section of input.ast.sections) {
    if (section.text) {
      for (const text of splitStatements(section.text)) lines.push({ text, sourceBlockIds: section.sourceBlockIds });
    }
    for (const entry of section.entries) {
      if (entry.summary) lines.push({ text: entry.summary, sourceBlockIds: entry.sourceBlockIds });
      for (const text of entry.bullets) lines.push({ text, sourceBlockIds: entry.sourceBlockIds });
    }
  }
  return lines.filter(({ text }) => normalizeText(text).length >= 4);
}

export const evidenceMineCapability = defineCapability(
  "evidence.mine",
  EvidenceMineInputSchema,
  EvidenceMineOutputSchema,
  (input) => {
    const lines = allResumeLines(input.resume);
    const evidenceAssets: EvidenceAsset[] = [];
    const claims: Claim[] = [];
    lines.forEach(({ text, sourceBlockIds }, index) => {
      const normalized = normalizeText(text);
      const evidenceId = stableId("evidence", `${input.resume.id}:${index}:${normalized}`);
      const claimId = stableId("claim", `${input.resume.id}:${index}:${normalized}`);
      const parts = claimParts(normalized);
      evidenceAssets.push({
        id: evidenceId,
        kind: "resume_text",
        label: `简历原文 ${index + 1}`,
        content: normalized,
        sourceBlockIds,
        verifiedByUser: false,
        confidence: sourceBlockIds.length ? 0.7 : 0.6,
      });
      claims.push({
        id: claimId,
        text: normalized,
        action: parts.action,
        method: parts.method,
        result: parts.result,
        sourceBlockIds,
        evidenceAssetIds: [evidenceId],
        status: "resume_only",
        confidence: sourceBlockIds.length ? 0.7 : 0.6,
        missingInformation: parts.missingInformation,
      });
    });
    return {
      data: { evidenceAssets, claims },
      confidence: lines.length ? 0.72 : 0.35,
      evidenceReferences: [...new Set(lines.flatMap((line) => line.sourceBlockIds))],
      warnings: lines.length ? [] : [{ code: "NO_CLAIMS", message: "未从结构化简历中找到可评估的经历描述。" }],
    };
  },
);

export const claimAssessCapability = defineCapability(
  "claim.assess",
  ClaimAssessInputSchema,
  ClaimAssessOutputSchema,
  (input: ClaimAssessInput) => {
    const linked = input.evidenceAssets.filter((asset) => input.claim.evidenceAssetIds.includes(asset.id));
    const independentlySupported = linked.some((asset) => asset.kind !== "resume_text" && asset.verifiedByUser);
    const userConfirmed = linked.some((asset) => asset.kind === "user_statement" && asset.verifiedByUser);
    const hasResumeSource = linked.some((asset) => asset.kind === "resume_text") || input.claim.sourceBlockIds.length > 0;
    const status = independentlySupported
      ? "supported"
      : userConfirmed
        ? "user_confirmed"
        : hasResumeSource
          ? "resume_only"
          : "needs_evidence";
    const confidence = independentlySupported ? 0.92 : userConfirmed ? 0.82 : hasResumeSource ? 0.65 : 0.3;
    return {
      data: { ...input.claim, status, confidence },
      confidence,
      evidenceReferences: linked.map((asset) => asset.id),
      warnings: status === "needs_evidence" ? [{ code: "EVIDENCE_REQUIRED", message: "该声明当前没有可追溯依据。" }] : [],
    };
  },
);

export const claimConflictCapability = defineCapability(
  "claim.conflict",
  ClaimConflictInputSchema,
  ClaimConflictOutputSchema,
  (input: ClaimConflictInput) => {
    const conflicts: Array<{ claimIds: [string, string]; reason: string; confidence: number }> = [];
    for (let left = 0; left < input.claims.length; left += 1) {
      for (let right = left + 1; right < input.claims.length; right += 1) {
        const a = input.claims[left];
        const b = input.claims[right];
        const shared = keywordOverlap(a.text, b.text);
        const aNumbers = numericTokens(a.text);
        const bNumbers = numericTokens(b.text);
        if (shared.length >= 2 && aNumbers.length && bNumbers.length && !aNumbers.some((number) => bNumbers.includes(number))) {
          conflicts.push({
            claimIds: [a.id, b.id],
            reason: `相似陈述包含不同数值（${aNumbers.join("、")} / ${bNumbers.join("、")}），需要人工核对。`,
            confidence: 0.7,
          });
        }
      }
    }
    return { data: { conflicts }, confidence: conflicts.length ? 0.7 : 0.55, evidenceReferences: input.claims.map((claim) => claim.id) };
  },
);

const DIMENSION_LABELS: Record<ScoreDimension["id"], string> = {
  impact: "成果与影响力",
  completeness: "信息完整性",
  clarity: "清晰与精炼",
  structure: "结构与版式",
  ats: "ATS 可解析性",
  language: "语言规范性",
};

function dimension(id: ScoreDimension["id"], score: number, maxScore: number, deductions: string[], evidence: string[] = []): ScoreDimension {
  return { id, label: DIMENSION_LABELS[id], score: round(clamp(score, 0, maxScore), 1), maxScore, evidence, deductions };
}

export const resumeScoreCapability = defineCapability(
  "resume.score",
  ResumeScoreInputSchema,
  ResumeScoreOutputSchema,
  (input: ResumeScoreInput) => {
    const entries = input.resume.ast.sections.flatMap((section) => section.entries);
    const bullets = entries.flatMap((entry) => entry.bullets);
    const metricBullets = bullets.filter((bullet) => numericTokens(bullet).length > 0);
    const contact = input.resume.ast.contact;
    const sectionTypes = new Set(input.resume.ast.sections.map((section) => section.type));
    const averageBulletLength = bullets.length ? bullets.reduce((sum, bullet) => sum + bullet.length, 0) / bullets.length : 0;
    const lowConfidenceBlocks = input.resume.sourceBlocks.filter((block) => block.confidence < 0.75);
    const inconsistentPunctuation = bullets.filter((bullet) => /[。.]$/.test(bullet)).length > 0 && bullets.some((bullet) => !/[。.]$/.test(bullet));

    const dimensions = [
      dimension(
        "impact",
        8 + Math.min(9, metricBullets.length * 2.25) + Math.min(8, input.claims.filter((claim) => claim.result).length),
        25,
        metricBullets.length ? [] : ["经历描述缺少可核实的结果或影响"],
        metricBullets.slice(0, 3),
      ),
      dimension(
        "completeness",
        4 + (contact.name ? 2 : 0) + (contact.email || contact.phone ? 2 : 0) + (sectionTypes.has("experience") ? 3 : 0) + (sectionTypes.has("education") ? 2 : 0) + (sectionTypes.has("skills") ? 2 : 0),
        15,
        [
          ...(!contact.name ? ["缺少姓名"] : []),
          ...(!contact.email && !contact.phone ? ["缺少可用联系方式"] : []),
          ...(!sectionTypes.has("experience") ? ["缺少经历板块"] : []),
        ],
      ),
      dimension(
        "clarity",
        9 + (bullets.length ? 3 : 0) + (averageBulletLength > 0 && averageBulletLength <= 120 ? 3 : 0),
        15,
        [...(averageBulletLength > 120 ? ["部分要点过长，影响快速浏览"] : []), ...(!bullets.length ? ["缺少可扫描的要点列表"] : [])],
      ),
      dimension(
        "structure",
        7 + Math.min(5, sectionTypes.size) + (entries.length ? 3 : 0),
        15,
        input.resume.ast.sections.length ? [] : ["未识别到稳定的板块层级"],
      ),
      dimension(
        "ats",
        15 - Math.min(6, lowConfidenceBlocks.length) - (input.resume.parseMethod === "ocr" ? 2 : 0),
        15,
        [
          ...(lowConfidenceBlocks.length ? [`${lowConfidenceBlocks.length} 个文本块解析置信度较低`] : []),
          ...(input.resume.parseMethod === "ocr" ? ["全文依赖 OCR，建议人工核对"] : []),
        ],
      ),
      dimension(
        "language",
        12 + (bullets.length ? 2 : 0) - (inconsistentPunctuation ? 2 : 0),
        15,
        inconsistentPunctuation ? ["要点结尾标点不一致"] : [],
      ),
    ];
    const total = round(dimensions.reduce((sum, item) => sum + item.score, 0), 1);
    return {
      data: {
        resumeId: input.resume.id,
        resumeRevision: input.resume.revision,
        total,
        dimensions,
        summary: total >= 85 ? "结构与内容基础扎实，可继续做岗位定制。" : total >= 70 ? "基础完整，优先补强成果证据与表达密度。" : "建议先补齐核心信息和可核实的经历证据。",
      },
      confidence: input.resume.parseMethod === "native" ? 0.82 : 0.7,
      evidenceReferences: input.resume.sourceBlocks.map((block) => block.id),
    };
  },
);

function conservativeRewrite(text: string, locale: "zh" | "en"): { text: string; changes: string[] } {
  let rewritten = normalizeText(text);
  const changes: string[] = [];
  const replacements: Array<[RegExp, string, string]> =
    locale === "zh"
      ? [
          [/主要负责/g, "负责", "删除弱化表达“主要”"],
          [/成功地/g, "", "删除无法增加事实信息的副词"],
          [/在([\p{Script=Han}A-Za-z0-9+#.]+)方面/gu, "$1", "压缩“在…方面”结构"],
          [/\s*，\s*/g, "，", "统一中文逗号空格"],
        ]
      : [
          [/\bin order to\b/gi, "to", "Shortened 'in order to'"],
          [/\bsuccessfully\s+/gi, "", "Removed an unsupported intensifier"],
          [/\bwas responsible for\b/gi, "Responsible for", "Removed unnecessary passive phrasing"],
          [/\s+,/g, ",", "Normalized comma spacing"],
        ];
  for (const [pattern, replacement, message] of replacements) {
    if (pattern.test(rewritten)) {
      pattern.lastIndex = 0;
      rewritten = rewritten.replace(pattern, replacement);
      changes.push(message);
    }
  }
  return { text: normalizeText(rewritten), changes };
}

export const resumeSuggestCapability = defineCapability(
  "resume.suggest",
  ResumeSuggestInputSchema,
  ResumeSuggestOutputSchema,
  (input: ResumeSuggestInput) => {
    const suggestions: Suggestion[] = [];
    input.resume.ast.sections.forEach((section, sectionIndex) => {
      section.entries.forEach((entry, entryIndex) => {
        entry.bullets.forEach((bullet, bulletIndex) => {
          const claim = input.claims.find((candidate) => normalizeText(candidate.text) === normalizeText(bullet));
          const path = `/sections/${sectionIndex}/entries/${entryIndex}/bullets/${bulletIndex}`;
          const beforeHash = stableId("hash", bullet);
          const sourceBlockIds = entry.sourceBlockIds;
          if (/行业领先|世界级|顶尖|第一|best[- ]in[- ]class|world[- ]class|industry[- ]leading/i.test(bullet) && claim?.status !== "supported") {
            suggestions.push({
              id: stableId("suggestion", `${path}:proof:${bullet}`),
              resumeRevision: input.resume.revision,
              sourceBlockIds,
              claimIds: claim ? [claim.id] : [],
              kind: "needs_proof",
              status: "pending",
              originalText: bullet,
              rationale: "绝对化成果需要独立依据，确认前不能写入最终版本。",
              question: "你是否有排名、奖项、报告或其他材料支持这项表述？",
              beforeHash,
              // Keep the exact target while acceptance is blocked. User confirmation
              // replaces this value before the suggestion can be applied.
              patches: [{ operation: "replace", path, value: bullet }],
              affectedDimensions: ["impact", "language"],
              factRisk: "high",
              interviewRisk: "high",
            });
            return;
          }
          const locale = input.resume.locale === "en-US" ? "en" : "zh";
          const rewritten = conservativeRewrite(bullet, locale);
          if (rewritten.text !== normalizeText(bullet) || bullet.length > (locale === "zh" ? 120 : 220)) {
            const proposed = rewritten.text;
            suggestions.push({
              id: stableId("suggestion", `${path}:rewrite:${bullet}`),
              resumeRevision: input.resume.revision,
              sourceBlockIds,
              claimIds: claim ? [claim.id] : [],
              kind: "rewrite",
              status: "pending",
              originalText: bullet,
              proposedText: proposed,
              rationale: rewritten.changes.join("；") || "该要点偏长，建议保留事实后手动压缩。",
              beforeHash,
              patches: proposed === bullet ? [] : [{ operation: "replace", path, value: proposed }],
              affectedDimensions: ["clarity", "language"],
              factRisk: "none",
              interviewRisk: "none",
            });
            return;
          }
          if (!numericTokens(bullet).length && (section.type === "experience" || section.type === "projects")) {
            suggestions.push({
              id: stableId("suggestion", `${path}:ask:${bullet}`),
              resumeRevision: input.resume.revision,
              sourceBlockIds,
              claimIds: claim ? [claim.id] : [],
              kind: "ask_user",
              status: "pending",
              originalText: bullet,
              rationale: "当前描述说明了工作，但没有呈现可核实的结果；系统不会自行补造数字。",
              question: "这项工作带来了什么可核实变化（效率、质量、规模、收入或用户反馈）？",
              beforeHash,
              // The original value is intentionally a no-op until the user supplies
              // a factual replacement and reviews it as a normal rewrite.
              patches: [{ operation: "replace", path, value: bullet }],
              affectedDimensions: ["impact"],
              factRisk: "medium",
              interviewRisk: "low",
            });
          }
        });
      });
    });
    return {
      data: { suggestions },
      confidence: 0.74,
      evidenceReferences: [...new Set(suggestions.flatMap((suggestion) => suggestion.sourceBlockIds))],
      warnings: suggestions.length ? [] : [{ code: "NO_RULE_FINDINGS", message: "内置规则未发现需要修改的明确问题。" }],
    };
  },
);

export const resumeAtsAuditCapability = defineCapability(
  "resume.atsAudit",
  ResumeAtsAuditInputSchema,
  ResumeAtsAuditOutputSchema,
  (input: ResumeAtsAuditInput) => {
    const findings: z.infer<typeof ResumeAtsAuditOutputSchema>["findings"] = [];
    const lowConfidence = input.resume.sourceBlocks.filter((block) => block.confidence < 0.75);
    const tables = input.resume.sourceBlocks.filter((block) => block.role === "table");
    if (!input.resume.ast.contact.email && !input.resume.ast.contact.phone) {
      findings.push({ code: "CONTACT_MISSING", severity: "error", message: "缺少可识别的邮箱或电话。", sourceBlockIds: [] });
    }
    if (tables.length) findings.push({ code: "TABLE_LAYOUT", severity: "warning", message: "表格布局可能改变 ATS 阅读顺序。", sourceBlockIds: tables.map((block) => block.id) });
    if (lowConfidence.length) findings.push({ code: "LOW_CONFIDENCE_TEXT", severity: "warning", message: "部分文本解析置信度较低。", sourceBlockIds: lowConfidence.map((block) => block.id) });
    if (input.resume.ast.sections.length === 0) findings.push({ code: "NO_SECTIONS", severity: "error", message: "未识别到标准简历板块。", sourceBlockIds: [] });
    const score = clamp(100 - findings.reduce((sum, finding) => sum + (finding.severity === "error" ? 25 : finding.severity === "warning" ? 10 : 2), 0), 0, 100);
    return { data: { score, passed: !findings.some((finding) => finding.severity === "error"), findings }, confidence: 0.8, evidenceReferences: input.resume.sourceBlocks.map((block) => block.id) };
  },
);

function classifyRequirement(line: string): { category: z.infer<typeof JdParseOutputSchema>["requirements"][number]["category"]; importance: number } {
  if (/优先|加分|preferred|nice to have|bonus/i.test(line)) return { category: "nice_to_have", importance: 0.45 };
  if (/必须|任职要求|本科|硕士|\d+\s*年|required|must|degree|years? of/i.test(line)) return { category: "must_have", importance: 1 };
  if (/负责|职责|工作内容|you will|responsibilit|duties/i.test(line)) return { category: "responsibility", importance: 0.8 };
  if (/地点|出差|薪资|到岗|location|travel|salary|on[- ]site|remote/i.test(line)) return { category: "constraint", importance: 0.8 };
  return { category: "skill", importance: 0.65 };
}

export const jdParseCapability = defineCapability(
  "jd.parse",
  JdParseInputSchema,
  JdParseOutputSchema,
  (input: JdParseInput) => {
    const sourceText = unwrapUntrustedDocumentText(input.text);
    const lines = splitStatements(sourceText.replace(/[•·●▪]/g, "\n"));
    const inferredTitle = input.title ?? lines.find((line) => line.length <= 60) ?? (input.locale === "en-US" ? "Target role" : "目标岗位");
    const jobId = stableId("job", `${input.company ?? ""}:${inferredTitle}:${sourceText}`);
    const requirements = lines
      .filter((line) => line !== inferredTitle && line.length >= 6)
      .slice(0, 30)
      .map((line, index) => {
        const classified = classifyRequirement(line);
        return {
          id: stableId("requirement", `${jobId}:${index}:${line}`),
          jobPostingId: jobId,
          category: classified.category,
          text: line,
          keywords: extractKeywords(line).slice(0, 12),
          importance: classified.importance,
        };
      });
    return {
      data: {
        jobPosting: {
          id: jobId,
          title: inferredTitle,
          company: input.company,
          location: input.location,
          locale: input.locale,
          rawText: sourceText,
        },
        requirements,
      },
      confidence: requirements.length >= 3 ? 0.76 : 0.55,
      evidenceReferences: requirements.map((requirement) => requirement.id),
      warnings: requirements.length ? [] : [{ code: "NO_REQUIREMENTS", message: "岗位描述过短，未拆解出明确要求。" }],
    };
  },
);

export const jobMatchCapability = defineCapability(
  "job.match",
  JobMatchInputSchema,
  JobMatchOutputSchema,
  (input: JobMatchInput) => {
    const maps = input.requirements.map((requirement) => {
      const ranked = input.claims
        .map((claim) => ({ claim, overlap: keywordOverlap(requirement.keywords.length ? requirement.keywords : requirement.text, claim.text) }))
        .filter((item) => item.overlap.length)
        .sort((a, b) => b.overlap.length - a.overlap.length);
      const best = ranked[0];
      const conflict = ranked.find((item) => item.claim.status === "conflicting");
      const status = conflict ? "conflict" : best && best.overlap.length >= Math.min(2, Math.max(1, requirement.keywords.length)) ? "met" : best ? "partial" : "gap";
      const claimIds = ranked.slice(0, 3).map((item) => item.claim.id);
      const evidenceAssetIds = [...new Set(ranked.slice(0, 3).flatMap((item) => item.claim.evidenceAssetIds))];
      return {
        requirementId: requirement.id,
        status,
        claimIds,
        evidenceAssetIds,
        explanation:
          status === "met"
            ? `简历证据覆盖关键词：${best.overlap.join("、")}`
            : status === "partial"
              ? `存在相关经历，但只覆盖：${best.overlap.join("、")}`
              : status === "conflict"
                ? "相关简历声明存在待核对冲突。"
                : "当前简历中没有找到可追溯证据。",
        confidence: status === "gap" ? 0.62 : status === "partial" ? 0.65 : 0.75,
        suggestedAction: status === "gap" ? "如有真实经历，请补充具体行动与结果；没有则保留为能力缺口。" : status === "partial" ? "补充与该要求直接相关的方法或结果。" : undefined,
      } as const;
    });
    const totalWeight = input.requirements.reduce((sum, requirement) => sum + requirement.importance, 0);
    const coveredWeight = input.requirements.reduce((sum, requirement, index) => sum + requirement.importance * (maps[index].status === "met" ? 1 : maps[index].status === "partial" ? 0.5 : 0), 0);
    const evidenceCoverageRate = totalWeight ? round((coveredWeight / totalWeight) * 100, 1) : 0;
    return {
      data: { evidenceCoverageRate, maps, disclaimer: "证据覆盖率仅表示简历材料与岗位要求的适配程度，不代表录取或获得面试的概率。" },
      confidence: input.requirements.length ? 0.7 : 0.35,
      evidenceReferences: [...new Set(maps.flatMap((map) => [...map.claimIds, ...map.evidenceAssetIds]))],
    };
  },
);

export const jobRiskDetectCapability = defineCapability(
  "job.riskDetect",
  JobRiskDetectInputSchema,
  JobRiskDetectOutputSchema,
  (input: JobRiskDetectInput) => {
    const patterns: Array<{ code: string; severity: "low" | "medium" | "high"; pattern: RegExp; explanation: string }> = [
      { code: "UPFRONT_FEE", severity: "high", pattern: /培训费|押金|保证金|先交费|registration fee|deposit/i, explanation: "正规招聘通常不会要求候选人先支付费用。" },
      { code: "DISCRIMINATORY", severity: "high", pattern: /仅限男性|仅限女性|已婚已育|年龄[：:]?\s*\d|male only|female only|marital status/i, explanation: "描述可能包含与岗位无关的歧视性限制。" },
      { code: "UNPAID_TRIAL", severity: "medium", pattern: /无薪试岗|免费试岗|unpaid trial/i, explanation: "无薪试岗可能带来劳动权益风险。" },
      { code: "VAGUE_COMPENSATION", severity: "low", pattern: /薪资面议|上不封顶|高额回报|competitive salary/i, explanation: "薪酬范围不明确，建议在沟通前确认结构和支付条件。" },
      { code: "CONTACT_OFF_PLATFORM", severity: "medium", pattern: /私人微信|个人账户|telegram|whatsapp/i, explanation: "要求转移至私人渠道时，应先核验公司和招聘方身份。" },
    ];
    const risks = patterns.flatMap((item) => {
      const match = input.jobPosting.rawText.match(item.pattern);
      return match ? [{ code: item.code, severity: item.severity, excerpt: excerpt(match[0], 80), explanation: item.explanation }] : [];
    });
    return { data: { risks }, confidence: risks.length ? 0.82 : 0.62, evidenceReferences: [input.jobPosting.id] };
  },
);

function rewriteCapability(id: "copy.rewrite.zh" | "copy.rewrite.en", locale: "zh" | "en") {
  return defineCapability(id, CopyRewriteInputSchema, CopyRewriteOutputSchema, (input: CopyRewriteInput) => {
    const rewritten = conservativeRewrite(input.text, locale);
    const missingTerms = input.preserveTerms.filter((term) => !rewritten.text.includes(term));
    const finalText = missingTerms.length ? normalizeText(input.text) : rewritten.text;
    return {
      data: {
        original: input.text,
        rewritten: finalText,
        changes: missingTerms.length ? ["为保护指定术语，已保留原文。"] : rewritten.changes,
        addedFacts: false as const,
      },
      confidence: 0.85,
      evidenceReferences: [],
    };
  });
}

export const copyRewriteZhCapability = rewriteCapability("copy.rewrite.zh", "zh");
export const copyRewriteEnCapability = rewriteCapability("copy.rewrite.en", "en");

export const copyConsistencyCapability = defineCapability(
  "copy.consistency",
  CopyConsistencyInputSchema,
  CopyConsistencyOutputSchema,
  (input: CopyConsistencyInput) => {
    const withTerminal = input.texts.filter((text) => /[。.!]$/.test(normalizeText(text))).length;
    const useTerminal = withTerminal >= input.texts.length / 2;
    const issues: z.infer<typeof CopyConsistencyOutputSchema>["issues"] = [];
    input.texts.forEach((text, index) => {
      const normalized = normalizeText(text);
      if (!normalized) return;
      const hasTerminal = /[。.!]$/.test(normalized);
      if (hasTerminal !== useTerminal) {
        const terminal = input.locale === "en-US" ? "." : "。";
        issues.push({
          index,
          code: "TERMINAL_PUNCTUATION",
          message: "同级要点的结尾标点不一致。",
          suggestedText: useTerminal ? `${normalized.replace(/[。.!]$/, "")}${terminal}` : normalized.replace(/[。.!]$/, ""),
        });
      }
    });
    return { data: { consistent: issues.length === 0, issues }, confidence: 0.9, evidenceReferences: [] };
  },
);

const BUILTIN_QUESTIONS: InterviewQuestion[] = [
  { id: "q_zh_star", locale: "zh-CN", prompt: "请讲一个你解决复杂问题的具体经历。", category: "behavioral", difficulty: "intermediate", roleFamilies: [], skills: ["问题解决"], followUps: ["你个人采取了哪些行动？", "结果如何验证？"], scoringAnchors: ["情境清楚", "个人行动具体", "结果可核实"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_zh_conflict", locale: "zh-CN", prompt: "请讲一次你与同事意见不一致并推动达成结果的经历。", category: "behavioral", difficulty: "intermediate", roleFamilies: [], skills: ["协作", "沟通"], followUps: ["你如何理解对方的目标？", "事后会做什么不同选择？"], scoringAnchors: ["不推卸责任", "说明取舍", "有复盘"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_zh_project", locale: "zh-CN", prompt: "选择简历中的一个项目，说明你的职责、关键决策和最终结果。", category: "resume", difficulty: "intermediate", roleFamilies: [], skills: ["项目管理"], followUps: ["哪个结果最能证明你的贡献？"], scoringAnchors: ["与简历一致", "区分个人和团队贡献"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_zh_failure", locale: "zh-CN", prompt: "讲一次结果没有达到预期的经历，你从中学到了什么？", category: "behavioral", difficulty: "advanced", roleFamilies: [], skills: ["复盘"], followUps: ["你后来如何验证改进有效？"], scoringAnchors: ["承认责任", "有具体改进"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_zh_role", locale: "zh-CN", prompt: "为什么这个岗位适合你当前的能力和下一步发展？", category: "motivation", difficulty: "introductory", roleFamilies: [], skills: ["岗位认知"], followUps: ["你仍需补强什么能力？"], scoringAnchors: ["结合岗位要求", "引用真实证据"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_zh_priority", locale: "zh-CN", prompt: "当多个重要任务同时临近截止时间时，你如何确定优先级？", category: "behavioral", difficulty: "intermediate", roleFamilies: [], skills: ["优先级管理"], followUps: ["你如何同步风险？"], scoringAnchors: ["标准明确", "主动沟通"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_en_star", locale: "en-US", prompt: "Tell me about a time you solved a complex problem.", category: "behavioral", difficulty: "intermediate", roleFamilies: [], skills: ["problem solving"], followUps: ["What did you personally do?", "How did you validate the outcome?"], scoringAnchors: ["clear context", "specific individual action", "verifiable result"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_en_conflict", locale: "en-US", prompt: "Describe a disagreement with a colleague and how you reached an outcome.", category: "behavioral", difficulty: "intermediate", roleFamilies: [], skills: ["collaboration", "communication"], followUps: ["How did you understand their goals?"], scoringAnchors: ["owns decisions", "explains trade-offs"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_en_project", locale: "en-US", prompt: "Choose one project from your resume and explain your role, key decisions, and result.", category: "resume", difficulty: "intermediate", roleFamilies: [], skills: ["project management"], followUps: ["Which evidence best supports your contribution?"], scoringAnchors: ["consistent with resume", "separates team and individual work"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_en_failure", locale: "en-US", prompt: "Tell me about an outcome that fell short and what you learned.", category: "behavioral", difficulty: "advanced", roleFamilies: [], skills: ["reflection"], followUps: ["How did you validate your improvement?"], scoringAnchors: ["owns responsibility", "specific change"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_en_role", locale: "en-US", prompt: "Why is this role a good fit for your current strengths and next step?", category: "motivation", difficulty: "introductory", roleFamilies: [], skills: ["role understanding"], followUps: ["What capability do you still need to build?"], scoringAnchors: ["connects to role", "uses real evidence"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
  { id: "q_en_priority", locale: "en-US", prompt: "How do you prioritize when several important deadlines collide?", category: "behavioral", difficulty: "intermediate", roleFamilies: [], skills: ["prioritization"], followUps: ["How do you communicate risk?"], scoringAnchors: ["clear criteria", "proactive communication"], source: "builtin-general-v1", generated: false, referenceQuestionIds: [] },
];

export const questionRetrieveCapability = defineCapability(
  "question.retrieve",
  QuestionRetrieveInputSchema,
  QuestionRetrieveOutputSchema,
  (input: QuestionRetrieveInput) => {
    const catalog = input.catalog.length ? input.catalog : BUILTIN_QUESTIONS;
    const desiredLocale = input.locale === "mixed" ? null : input.locale;
    const requestedKeywords = [input.role ?? "", ...input.skills];
    const ranked = catalog
      .filter((question) => !desiredLocale || question.locale === desiredLocale)
      .map((question, index) => ({
        question,
        index,
        score: keywordOverlap([...question.skills, ...question.roleFamilies], requestedKeywords).length,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, input.count)
      .map((item) => item.question);
    return { data: { questions: ranked }, confidence: input.catalog.length ? 0.78 : 0.65, evidenceReferences: ranked.map((question) => question.id) };
  },
);

export const interviewPlanCapability = defineCapability(
  "interview.plan",
  InterviewPlanInputSchema,
  InterviewPlanOutputSchema,
  (input: InterviewPlanInput) => {
    const selected = input.questions.slice(0, input.questionCount);
    const targetMinutes = selected.length ? round(input.durationMinutes / selected.length, 1) : input.durationMinutes;
    return {
      data: {
        durationMinutes: input.durationMinutes,
        maxFollowUpsPerQuestion: input.maxFollowUpsPerQuestion,
        items: selected.map((question, index) => ({ order: index + 1, question, targetMinutes })),
      },
      confidence: selected.length === input.questionCount ? 0.9 : 0.65,
      evidenceReferences: selected.map((question) => question.id),
      warnings: selected.length < input.questionCount ? [{ code: "QUESTION_SHORTAGE", message: "题库数量不足，计划已按可用题目缩短。" }] : [],
    };
  },
);

export const storyBuildCapability = defineCapability(
  "story.build",
  StoryBuildInputSchema,
  StoryBuildOutputSchema,
  (input: StoryBuildInput) => {
    const linked = input.evidenceAssets.filter((asset) => input.claim.evidenceAssetIds.includes(asset.id));
    const parts = claimParts(input.claim.text);
    return {
      data: {
        id: stableId("story", input.claim.id),
        title: input.title ?? excerpt(input.claim.text, 32),
        situation: input.claim.subject ?? "待补充：当时的背景与约束",
        task: "待补充：你需要达成的具体目标",
        action: input.claim.action ?? parts.action,
        result: input.claim.result ?? "待补充：可核实的结果或影响",
        claimIds: [input.claim.id],
        evidenceAssetIds: linked.map((asset) => asset.id),
        keywords: extractKeywords(input.claim.text).slice(0, 10),
        riskNotes: [
          ...(input.claim.status === "needs_evidence" ? ["当前声明缺少证据，练习时不要补造细节。"] : []),
          ...(!input.claim.result ? ["结果尚不完整，回答前应补充真实信息。"] : []),
        ],
      },
      confidence: input.claim.result ? 0.76 : 0.58,
      evidenceReferences: [input.claim.id, ...linked.map((asset) => asset.id)],
    };
  },
);

function answerLength(answer: string): number {
  const latinWords = answer.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  const hanChars = answer.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  return latinWords + Math.ceil(hanChars / 2);
}

export const answerEvaluateCapability = defineCapability(
  "answer.evaluate",
  AnswerEvaluateInputSchema,
  AnswerEvaluateOutputSchema,
  (input: AnswerEvaluateInput) => {
    const answer = normalizeText(unwrapUntrustedDocumentText(input.answer));
    const length = answerLength(answer);
    const targetKeywords = [...input.question.skills, ...input.expectedKeywords];
    const overlap = keywordOverlap(answer, targetKeywords);
    const relevance = clamp(7 + overlap.length * 4 + (length >= 20 ? 3 : 0), 0, 20);
    const structureMarkers = [/(?:当时|背景|situation|context)/i, /(?:目标|任务|task|goal)/i, /(?:我|本人|I\s)/i, /(?:结果|最终|提升|降低|result|outcome)/i];
    const structure = clamp(5 + structureMarkers.filter((pattern) => pattern.test(answer)).length * 3.5, 0, 20);
    const evidence = clamp(4 + numericTokens(answer).length * 4 + (/(?:例如|具体|because|for example|specifically)/i.test(answer) ? 4 : 0), 0, 20);
    const roleCompetency = clamp(7 + overlap.length * 4 + (/(?:权衡|决策|协作|分析|trade-?off|decision|collaborat|analy)/i.test(answer) ? 3 : 0), 0, 20);
    const clarity = length === 0 ? 0 : length < 20 ? 9 : length <= 250 ? 17 : length <= 400 ? 13 : 9;
    const dimensions = { relevance, structure, evidence, roleCompetency, clarity };
    const overallScore = round(Object.values(dimensions).reduce((sum, value) => sum + value, 0), 1);
    const strengths = [
      ...(relevance >= 15 ? ["回答与问题和目标能力相关。"] : []),
      ...(structure >= 15 ? ["回答包含较完整的背景、行动与结果结构。"] : []),
      ...(evidence >= 15 ? ["使用了具体例子或可核实结果。"] : []),
    ];
    const improvements = [
      ...(relevance < 15 ? ["开头先直接回答问题，再展开背景。"] : []),
      ...(structure < 15 ? ["明确区分背景、目标、个人行动和结果。"] : []),
      ...(evidence < 15 ? ["补充真实、可核实的例子或结果，不要编造数字。"] : []),
      ...(clarity < 15 ? [length < 20 ? "回答信息不足，至少补充一个完整例子。" : "删去重复背景，把重点放在个人行动和结果。"] : []),
    ];
    const fragments = splitStatements(answer).filter((statement) => numericTokens(statement).length || keywordOverlap(statement, targetKeywords).length).slice(0, 3);
    const evaluation: AnswerEvaluation = {
      questionId: input.question.id,
      overallScore,
      dimensions,
      strengths,
      improvements,
      citedAnswerFragments: fragments,
      followUpQuestion: input.question.followUps[0],
    };
    return { data: evaluation, confidence: length >= 20 ? 0.72 : 0.5, evidenceReferences: [input.question.id] };
  },
);

export const answerCoachCapability = defineCapability(
  "answer.coach",
  AnswerCoachInputSchema,
  AnswerCoachOutputSchema,
  (input: AnswerCoachInput) => {
    const weakest = Object.entries(input.evaluation.dimensions).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([name]) => name);
    const actionByDimension: Record<string, string> = {
      relevance: "第一句直接回应问题，并删去与目标能力无关的背景。",
      structure: "按“背景—目标—个人行动—结果”四步重组回答。",
      evidence: "从真实经历中补充一个可核实结果；没有数字时可说明范围、反馈或交付物。",
      roleCompetency: "明确说明你的判断、取舍及其与岗位能力的关系。",
      clarity: "将回答控制在一个核心故事，使用短句并避免重复。",
    };
    return {
      data: {
        headline: input.evaluation.overallScore >= 80 ? "回答基础扎实，继续强化证据。" : "先收紧结构，再补充真实证据。",
        actions: weakest.map((dimensionId) => actionByDimension[dimensionId]),
        improvedOutline: ["背景：一句话说明场景和约束", "目标：说明你负责的具体结果", "行动：列出两到三个个人动作与取舍", "结果：说明真实结果及验证方式", "复盘：补充学到什么（如问题需要）"],
        factSafetyReminder: "只使用你能在追问中解释并核实的信息，不补造数字或扩大个人贡献。",
      },
      confidence: 0.86,
      evidenceReferences: [input.question.id],
    };
  },
);

export const resumeInterviewCheckCapability = defineCapability(
  "resumeInterview.check",
  ResumeInterviewCheckInputSchema,
  ResumeInterviewCheckOutputSchema,
  (input: ResumeInterviewCheckInput) => {
    const answerNumbers = numericTokens(input.answer);
    const findings: z.infer<typeof ResumeInterviewCheckOutputSchema>["findings"] = [];
    for (const claim of input.claims) {
      const overlap = keywordOverlap(input.answer, claim.text);
      if (!overlap.length) continue;
      const claimNumbers = numericTokens(claim.text);
      const unmatchedAnswerNumbers = answerNumbers.filter((number) => !claimNumbers.includes(number));
      if (claimNumbers.length && unmatchedAnswerNumbers.length) {
        findings.push({ claimId: claim.id, severity: "warning", answerExcerpt: excerpt(input.answer), resumeExcerpt: excerpt(claim.text), explanation: `回答出现简历中没有的数值（${unmatchedAnswerNumbers.join("、")}），请核对口径。` });
      }
      if (claim.status === "conflicting" || claim.status === "needs_evidence") {
        findings.push({ claimId: claim.id, severity: "warning", answerExcerpt: excerpt(input.answer), resumeExcerpt: excerpt(claim.text), explanation: "关联简历声明本身仍待核对，请勿在回答中进一步扩大。" });
      }
    }
    return { data: { consistent: findings.length === 0, findings }, confidence: findings.length ? 0.72 : 0.55, evidenceReferences: findings.flatMap((finding) => (finding.claimId ? [finding.claimId] : [])) };
  },
);

export const piiRedactCapability = defineCapability(
  "pii.redact",
  PiiRedactInputSchema,
  PiiRedactOutputSchema,
  (input: PiiRedactInput) => {
    let redactedText = input.text;
    const detections: z.infer<typeof PiiRedactOutputSchema>["detections"] = [];
    const rules: Array<{ type: "email" | "phone" | "id_number" | "address" | "url"; pattern: RegExp; placeholder: string }> = [
      { type: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, placeholder: "[EMAIL]" },
      { type: "id_number", pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g, placeholder: "[ID_NUMBER]" },
      { type: "phone", pattern: /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)|(?<!\d)(?:\+?\d{1,3}[-\s]?)?(?:\d[-\s]?){7,12}(?!\d)/g, placeholder: "[PHONE]" },
      { type: "address", pattern: /(?:地址|住址|Address)\s*[：:]\s*[^\n,，;；]{6,80}/gi, placeholder: "[ADDRESS]" },
      { type: "url", pattern: /\bhttps?:\/\/[^\s<>{}\[\]"']+/gi, placeholder: "[URL]" },
    ];
    for (const rule of rules) {
      if (rule.pattern.test(redactedText)) {
        rule.pattern.lastIndex = 0;
        const count = redactedText.match(rule.pattern)?.length ?? 0;
        redactedText = redactedText.replace(rule.pattern, rule.placeholder);
        for (let index = 0; index < count; index += 1) detections.push({ type: rule.type, placeholder: rule.placeholder });
      }
    }
    return { data: { redactedText, detections }, confidence: 0.88, evidenceReferences: [], warnings: [{ code: "REVIEW_REDACTION", message: "规则脱敏可能漏掉非标准格式，请在发送给外部服务前复核。" }] };
  },
);

export const promptGuardCapability = defineCapability(
  "prompt.guard",
  PromptGuardInputSchema,
  PromptGuardOutputSchema,
  (input: PromptGuardInput) => {
    const patterns: Array<{ code: string; pattern: RegExp }> = [
      { code: "IGNORE_INSTRUCTIONS", pattern: /ignore (?:all |any )?(?:previous|prior|system) instructions?|忽略(?:之前|以上|系统)(?:的)?(?:指令|要求)/gi },
      { code: "ROLE_OVERRIDE", pattern: /you are now|act as (?:a|an)|你现在是|扮演(?:一个)?/gi },
      { code: "SECRET_REQUEST", pattern: /system prompt|developer message|api key|系统提示词|开发者消息|密钥/gi },
      { code: "TOOL_INSTRUCTION", pattern: /run (?:this )?(?:command|tool)|execute (?:a )?command|运行(?:这个)?命令|调用(?:这个)?工具/gi },
    ];
    const findings = patterns.flatMap((item) => {
      const matches = [...input.text.matchAll(item.pattern)];
      return matches.map((match) => ({ code: item.code, excerpt: excerpt(match[0], 80), action: "treat_as_untrusted_data" as const }));
    });
    const safeText = wrapUntrustedDocumentText(input.text);
    return { data: { safeText, suspicious: findings.length > 0, findings }, confidence: findings.length ? 0.9 : 0.7, evidenceReferences: [] };
  },
);

export const BUILTIN_BASELINE_CAPABILITIES = [
  ...DOCUMENT_AND_EXPORT_CAPABILITIES,
  evidenceMineCapability,
  claimAssessCapability,
  claimConflictCapability,
  resumeScoreCapability,
  resumeSuggestCapability,
  resumeAtsAuditCapability,
  jdParseCapability,
  jobMatchCapability,
  jobRiskDetectCapability,
  copyRewriteZhCapability,
  copyRewriteEnCapability,
  copyConsistencyCapability,
  questionRetrieveCapability,
  interviewPlanCapability,
  storyBuildCapability,
  answerEvaluateCapability,
  answerCoachCapability,
  resumeInterviewCheckCapability,
  piiRedactCapability,
  promptGuardCapability,
  ...PLATFORM_BASELINE_CAPABILITIES,
] as const;
