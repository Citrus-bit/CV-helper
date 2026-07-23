import "server-only";

import { z } from "zod";

import {
  AnswerCoachInputSchema,
  AnswerCoachOutputSchema,
  AnswerEvaluateInputSchema,
  AnswerEvaluateOutputSchema,
  InterviewPlanInputSchema,
  InterviewPlanOutputSchema,
  JdParseInputSchema,
  JdParseOutputSchema,
  JobMatchInputSchema,
  JobMatchOutputSchema,
  ResumeScoreInputSchema,
  ResumeScoreOutputSchema,
  ResumeSuggestInputSchema,
  ResumeSuggestOutputSchema,
  type BaselineCapabilityInputMap,
  type BaselineCapabilityOutputMap,
} from "@/lib/baseline/contracts";
import { extractKeywords, numericTokens, stableId, unwrapUntrustedDocumentText } from "@/lib/baseline/utils";
import {
  getCapabilityDescriptor,
  PROVIDER_GATEWAY_CAPABILITY_IDS,
  type Capability,
  type CapabilityContext,
  type ProviderGatewayCapabilityId,
  type SkillManifest,
} from "@/lib/capabilities";
import type { Claim, ResumeAST, Suggestion } from "@/lib/domain";

import { OpenAiCompatibleGateway, ProviderGatewayError } from "./provider-gateway";
import { PiiProjector } from "./pii-projection";

type GatewayInputMap = Pick<BaselineCapabilityInputMap, ProviderGatewayCapabilityId>;
type GatewayOutputMap = Pick<BaselineCapabilityOutputMap, ProviderGatewayCapabilityId>;
type GatewayCapability = Capability<GatewayInputMap[ProviderGatewayCapabilityId], GatewayOutputMap[ProviderGatewayCapabilityId]>;

export const PROVIDER_GATEWAY_MANIFEST: SkillManifest = {
  id: "builtin.provider-gateway",
  version: "1.0.0",
  kind: "adapter",
  contractVersion: "1.0",
  capabilities: [...PROVIDER_GATEWAY_CAPABILITY_IDS],
  locales: ["zh-CN", "en-US", "mixed"],
  dataScopes: ["resume_ast", "evidence_graph", "job_description", "anonymous_metadata", "interview_content"],
  networkPolicy: "provider_only",
  license: "Proprietary",
  provenance: "server-only-provider-gateway",
  evalSuiteId: "eval.provider-gateway.v1",
};

function projectorForInput<K extends ProviderGatewayCapabilityId>(id: K, input: GatewayInputMap[K]): PiiProjector {
  if (id !== "resume.score" && id !== "resume.suggest") return new PiiProjector();
  const resumeInput = input as GatewayInputMap["resume.score"];
  return new PiiProjector({
    names: [resumeInput.resume.ast.contact.name],
    addresses: [
      resumeInput.resume.ast.contact.location ?? "",
      ...resumeInput.resume.ast.sections.flatMap((section) =>
        section.entries.map((entry) => entry.location ?? ""),
      ),
    ],
  });
}

function assertNoProjectedPii(value: unknown, projector: PiiProjector): void {
  if (projector.containsSensitiveValue(JSON.stringify(value))) {
    throw new ProviderGatewayError("INVALID_RESPONSE");
  }
}

function minimalClaim(claim: Claim, sanitize: (value: string) => string) {
  return {
    id: claim.id,
    text: sanitize(claim.text),
    status: claim.status,
    confidence: claim.confidence,
    sourceBlockIds: claim.sourceBlockIds,
  };
}

function minimalResume(
  input: GatewayInputMap["resume.score"] | GatewayInputMap["resume.suggest"],
  projector: PiiProjector,
) {
  const sanitize = (value: string) => projector.redact(value);
  const referencedBlockIds = new Set([
    ...input.resume.ast.sections.flatMap((section) => [
      ...section.sourceBlockIds,
      ...section.entries.flatMap((entry) => entry.sourceBlockIds),
    ]),
    ...input.claims.flatMap((claim) => claim.sourceBlockIds),
  ]);
  return {
    resume: {
      id: input.resume.id,
      revision: input.resume.revision,
      locale: input.resume.locale,
      parseMethod: input.resume.parseMethod,
      sections: input.resume.ast.sections.map((section) => ({
        id: section.id,
        type: section.type,
        title: sanitize(section.title),
        text: section.text ? sanitize(section.text) : undefined,
        sourceBlockIds: section.sourceBlockIds,
        entries: section.entries.map((entry) => ({
          id: entry.id,
          title: sanitize(entry.title),
          subtitle: entry.subtitle ? sanitize(entry.subtitle) : undefined,
          organization: entry.organization ? sanitize(entry.organization) : undefined,
          startDate: entry.startDate,
          endDate: entry.endDate,
          current: entry.current,
          summary: entry.summary ? sanitize(entry.summary) : undefined,
          bullets: entry.bullets.map(sanitize),
          keywords: entry.keywords.map(sanitize),
          sourceBlockIds: entry.sourceBlockIds,
        })),
      })),
      sourceBlocks: input.resume.sourceBlocks
        .filter((block) => block.role !== "contact" && referencedBlockIds.has(block.id))
        .map((block) => ({ id: block.id, text: sanitize(block.text), role: block.role })),
    },
    claims: input.claims.map((claim) => minimalClaim(claim, sanitize)),
  };
}

function resumeGroundingCorpus(
  input: GatewayInputMap["resume.score"],
  projector: PiiProjector,
): string {
  const projected = minimalResume(input, projector);
  return [
    ...projected.resume.sections.flatMap((section) => [
      section.title,
      section.text ?? "",
      ...section.entries.flatMap((entry) => [
        entry.title,
        entry.subtitle ?? "",
        entry.organization ?? "",
        entry.summary ?? "",
        ...entry.bullets,
        ...entry.keywords,
      ]),
    ]),
    ...projected.resume.sourceBlocks.map((block) => block.text),
    ...projected.claims.map((claim) => claim.text),
  ].join("\n");
}

function projectInput<K extends ProviderGatewayCapabilityId>(id: K, input: GatewayInputMap[K]): unknown {
  const projector = projectorForInput(id, input);
  const sanitize = (value: string) => projector.redact(value);
  switch (id) {
    case "resume.score":
    case "resume.suggest":
      return minimalResume(input as GatewayInputMap["resume.score"], projector);
    case "jd.parse": {
      const jobInput = input as GatewayInputMap["jd.parse"];
      return {
        text: sanitize(jobInput.text),
        locale: jobInput.locale,
        title: jobInput.title ? sanitize(jobInput.title) : undefined,
        company: jobInput.company ? sanitize(jobInput.company) : undefined,
        location: jobInput.location ? sanitize(jobInput.location) : undefined,
      };
    }
    case "job.match": {
      const matchInput = input as GatewayInputMap["job.match"];
      return {
        requirements: matchInput.requirements.map((requirement) => ({
          id: requirement.id,
          jobPostingId: requirement.jobPostingId,
          category: requirement.category,
          text: sanitize(requirement.text),
          keywords: requirement.keywords.map(sanitize),
          importance: requirement.importance,
        })),
        claims: matchInput.claims.map((claim) => minimalClaim(claim, sanitize)),
      };
    }
    case "interview.plan": {
      const planInput = input as GatewayInputMap["interview.plan"];
      return {
        durationMinutes: planInput.durationMinutes,
        questionCount: planInput.questionCount,
        maxFollowUpsPerQuestion: planInput.maxFollowUpsPerQuestion,
        questions: planInput.questions.map((question) => ({
          id: question.id,
          locale: question.locale,
          prompt: sanitize(question.prompt),
          category: question.category,
          difficulty: question.difficulty,
          roleFamilies: question.roleFamilies.map(sanitize),
          skills: question.skills.map(sanitize),
          followUps: question.followUps.map(sanitize),
          scoringAnchors: question.scoringAnchors.map(sanitize),
          source: question.source,
          generated: question.generated,
          referenceQuestionIds: question.referenceQuestionIds,
        })),
      };
    }
    case "answer.evaluate": {
      const answerInput = input as GatewayInputMap["answer.evaluate"];
      return {
        question: {
          id: answerInput.question.id,
          locale: answerInput.question.locale,
          prompt: sanitize(answerInput.question.prompt),
          category: answerInput.question.category,
          difficulty: answerInput.question.difficulty,
          skills: answerInput.question.skills.map(sanitize),
          scoringAnchors: answerInput.question.scoringAnchors.map(sanitize),
        },
        answer: sanitize(answerInput.answer),
        expectedKeywords: answerInput.expectedKeywords.map(sanitize),
      };
    }
    case "answer.coach": {
      const coachInput = input as GatewayInputMap["answer.coach"];
      return {
        question: {
          id: coachInput.question.id,
          locale: coachInput.question.locale,
          prompt: sanitize(coachInput.question.prompt),
          category: coachInput.question.category,
          difficulty: coachInput.question.difficulty,
          skills: coachInput.question.skills.map(sanitize),
          scoringAnchors: coachInput.question.scoringAnchors.map(sanitize),
        },
        answer: sanitize(coachInput.answer),
        evaluation: coachInput.evaluation,
      };
    }
  }
}

function resolveStringPath(ast: ResumeAST, path: string): string | undefined {
  if (!/^\/(?:summary|sections\/\d+\/(?:text|entries\/\d+\/(?:title|subtitle|organization|summary|bullets\/\d+)))$/.test(path)) {
    return undefined;
  }
  const segments = path.slice(1).split("/");
  let current: unknown = ast;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else if (current && typeof current === "object" && Object.hasOwn(current, segment)) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

function sourceIdsForPath(ast: ResumeAST, path: string): string[] {
  if (path === "/summary") {
    return ast.sections.filter((section) => section.type === "summary").flatMap((section) => section.sourceBlockIds);
  }
  const sectionMatch = path.match(/^\/sections\/(\d+)\//);
  if (!sectionMatch) return [];
  const section = ast.sections[Number(sectionMatch[1])];
  if (!section) return [];
  const entryMatch = path.match(/^\/sections\/\d+\/entries\/(\d+)\//);
  return entryMatch ? section.entries[Number(entryMatch[1])]?.sourceBlockIds ?? [] : section.sourceBlockIds;
}

function unsupportedKeywords(candidate: string, supportedText: string): string[] {
  const supported = new Set(extractKeywords(supportedText).map((keyword) => keyword.toLowerCase()));
  return extractKeywords(candidate).filter((keyword) => !supported.has(keyword.toLowerCase()));
}

function normalizedGroundingText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function isGroundedFragment(fragment: string, source: string): boolean {
  const normalizedFragment = normalizedGroundingText(fragment);
  return normalizedFragment.length > 0 && normalizedGroundingText(source).includes(normalizedFragment);
}

function claimRelevance(requirement: GatewayInputMap["job.match"]["requirements"][number], claim: Claim): string[] {
  const candidates = [
    ...requirement.keywords,
    ...extractKeywords(requirement.text),
  ]
    .map((keyword) => normalizedGroundingText(keyword))
    .filter((keyword) => keyword.length >= 2);
  const claimText = normalizedGroundingText(claim.text);
  return [...new Set(candidates.filter((keyword) => claimText.includes(keyword)))];
}

function validFactClaim(claim: Claim): boolean {
  return claim.status === "resume_only" || claim.status === "user_confirmed" || claim.status === "supported";
}

function validateSuggestionOutput(
  input: GatewayInputMap["resume.suggest"],
  output: GatewayOutputMap["resume.suggest"],
): GatewayOutputMap["resume.suggest"] {
  if (output.suggestions.length > 40) throw new ProviderGatewayError("INVALID_RESPONSE");
  const sourceBlockIds = new Set(input.resume.sourceBlocks.filter((block) => block.role !== "contact").map((block) => block.id));
  const claims = new Map(input.claims.map((claim) => [claim.id, claim]));
  const seenPaths = new Set<string>();
  const suggestions = output.suggestions.map((suggestion): Suggestion => {
    const expectedPatchCount = suggestion.kind === "use_as_is" ? 0 : 1;
    if (
      suggestion.sourceBlockIds.some((id) => !sourceBlockIds.has(id)) ||
      suggestion.claimIds.some((id) => !claims.has(id)) ||
      suggestion.sourceBlockIds.length + suggestion.claimIds.length === 0 ||
      suggestion.patches.length !== expectedPatchCount
    ) {
      throw new ProviderGatewayError("INVALID_RESPONSE");
    }
    let original = suggestion.originalText;
    for (const patch of suggestion.patches) {
      if (patch.operation !== "replace" || typeof patch.value !== "string" || seenPaths.has(patch.path)) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      const current = resolveStringPath(input.resume.ast, patch.path);
      if (current === undefined || current !== suggestion.originalText) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      const targetSourceIds = sourceIdsForPath(input.resume.ast, patch.path);
      const citedClaimSourceIds = suggestion.claimIds.flatMap((id) => claims.get(id)?.sourceBlockIds ?? []);
      if (
        targetSourceIds.length > 0 &&
        ![...suggestion.sourceBlockIds, ...citedClaimSourceIds].some((id) => targetSourceIds.includes(id))
      ) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      original = current;
      seenPaths.add(patch.path);
      const targetClaims = suggestion.claimIds
        .map((id) => claims.get(id))
        .filter(
          (claim): claim is Claim =>
            Boolean(claim) &&
            validFactClaim(claim!) &&
            claim!.sourceBlockIds.some((sourceId) => targetSourceIds.includes(sourceId)),
        );
      const supportedText = [
        current,
        ...targetClaims.map((claim) => claim.text),
      ].join(" ");
      const introducedNumbers = numericTokens(patch.value).filter((number) => !numericTokens(supportedText).includes(number));
      const introducedKeywords = unsupportedKeywords(patch.value, supportedText);
      if (introducedNumbers.length || introducedKeywords.length) throw new ProviderGatewayError("INVALID_RESPONSE");
      const hasUnsupportedClaim = suggestion.claimIds.some((id) => {
        const claim = claims.get(id);
        return !claim || !validFactClaim(claim);
      });
      if ((suggestion.factRisk === "medium" || suggestion.factRisk === "high") && hasUnsupportedClaim && patch.value !== current) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      if ((suggestion.kind === "needs_proof" || suggestion.kind === "ask_user") && patch.value !== current) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      if (suggestion.kind === "rewrite" && suggestion.proposedText !== patch.value) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
    }
    if (suggestion.kind === "use_as_is" && suggestion.proposedText !== undefined) {
      throw new ProviderGatewayError("INVALID_RESPONSE");
    }
    return {
      ...suggestion,
      id: stableId("suggestion-ai", `${input.resume.id}:${input.resume.revision}:${suggestion.kind}:${original}:${suggestion.patches[0]?.path ?? "none"}`),
      resumeRevision: input.resume.revision,
      beforeHash: stableId("hash", original),
      status: "pending",
    };
  });
  return { suggestions };
}

function validateOutput<K extends ProviderGatewayCapabilityId>(
  id: K,
  input: GatewayInputMap[K],
  output: GatewayOutputMap[K],
): GatewayOutputMap[K] {
  const projector = projectorForInput(id, input);
  assertNoProjectedPii(output, projector);
  switch (id) {
    case "resume.score": {
      const scoreInput = input as GatewayInputMap["resume.score"];
      const score = output as GatewayOutputMap["resume.score"];
      const expectedMax = new Map([
        ["impact", 25],
        ["completeness", 15],
        ["clarity", 15],
        ["structure", 15],
        ["ats", 15],
        ["language", 15],
      ]);
      const groundedResume = resumeGroundingCorpus(scoreInput, projector);
      const groundedNumbers = numericTokens(groundedResume);
      if (
        score.resumeId !== scoreInput.resume.id ||
        score.resumeRevision !== scoreInput.resume.revision ||
        new Set(score.dimensions.map((dimension) => dimension.id)).size !== 6 ||
        score.dimensions.some((dimension) => expectedMax.get(dimension.id) !== dimension.maxScore) ||
        score.dimensions.some(
          (dimension) =>
            dimension.score > dimension.maxScore ||
            dimension.label.length > 80 ||
            dimension.evidence.length > 8 ||
            dimension.deductions.length > 8 ||
            [...dimension.evidence, ...dimension.deductions].some((item) => item.length > 500) ||
            dimension.evidence.some((evidence) => !isGroundedFragment(evidence, groundedResume)),
        ) ||
        score.summary.length > 1_000 ||
        numericTokens(score.summary).some((number) => !groundedNumbers.includes(number)) ||
        Math.abs(score.total - score.dimensions.reduce((sum, dimension) => sum + dimension.score, 0)) > 0.2
      ) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      const dimensionLabels = new Map(
        scoreInput.resume.locale === "en-US"
          ? [
              ["impact", "impact"],
              ["completeness", "completeness"],
              ["clarity", "clarity"],
              ["structure", "structure"],
              ["ats", "ATS readability"],
              ["language", "language"],
            ]
          : [
              ["impact", "成果"],
              ["completeness", "完整性"],
              ["clarity", "清晰度"],
              ["structure", "结构"],
              ["ats", "ATS 可读性"],
              ["language", "语言"],
            ],
      );
      const ordered = [...score.dimensions].sort(
        (left, right) => right.score / right.maxScore - left.score / left.maxScore,
      );
      const strongest = dimensionLabels.get(ordered[0].id)!;
      const weakest = dimensionLabels.get(ordered.at(-1)!.id)!;
      return {
        ...score,
        dimensions: score.dimensions.map((dimension) => ({
          ...dimension,
          label: dimensionLabels.get(dimension.id)!,
        })),
        summary:
          scoreInput.resume.locale === "en-US"
            ? `The resume is relatively stronger in ${strongest}; prioritize improving ${weakest}.`
            : `当前简历在${strongest}维度相对较好，建议优先改善${weakest}。`,
      } as GatewayOutputMap[K];
    }
    case "resume.suggest":
      return validateSuggestionOutput(
        input as GatewayInputMap["resume.suggest"],
        output as GatewayOutputMap["resume.suggest"],
      ) as GatewayOutputMap[K];
    case "jd.parse": {
      const jobInput = input as GatewayInputMap["jd.parse"];
      const jobOutput = output as GatewayOutputMap["jd.parse"];
      const sourceText = projector.redact(unwrapUntrustedDocumentText(jobInput.text));
      const expectedTitle = jobInput.title ? projector.redact(jobInput.title) : undefined;
      const expectedCompany = jobInput.company ? projector.redact(jobInput.company) : undefined;
      const expectedLocation = jobInput.location ? projector.redact(jobInput.location) : undefined;
      const groundedJobField = (value: string | undefined, expected: string | undefined) =>
        value === undefined || (expected ? normalizedGroundingText(value) === normalizedGroundingText(expected) : isGroundedFragment(value, sourceText));
      if (
        jobOutput.requirements.length > 30 ||
        new Set(jobOutput.requirements.map((requirement) => requirement.id)).size !== jobOutput.requirements.length ||
        jobOutput.jobPosting.locale !== jobInput.locale ||
        !groundedJobField(jobOutput.jobPosting.title, expectedTitle) ||
        !groundedJobField(jobOutput.jobPosting.company, expectedCompany) ||
        !groundedJobField(jobOutput.jobPosting.location, expectedLocation) ||
        !groundedJobField(jobOutput.jobPosting.employmentType, undefined) ||
        !groundedJobField(jobOutput.jobPosting.seniority, undefined) ||
        jobOutput.requirements.some(
          (requirement) =>
            requirement.jobPostingId !== jobOutput.jobPosting.id ||
            !isGroundedFragment(requirement.text, sourceText) ||
            requirement.keywords.length > 12 ||
            requirement.keywords.some((keyword) => !isGroundedFragment(keyword, requirement.text)),
        )
      ) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      return {
        ...jobOutput,
        jobPosting: { ...jobOutput.jobPosting, rawText: sourceText },
      } as GatewayOutputMap[K];
    }
    case "job.match": {
      const matchInput = input as GatewayInputMap["job.match"];
      const matchOutput = output as GatewayOutputMap["job.match"];
      const requirementIds = new Set(matchInput.requirements.map((requirement) => requirement.id));
      const claims = new Map(matchInput.claims.map((claim) => [claim.id, claim]));
      if (
        matchOutput.maps.length !== requirementIds.size ||
        new Set(matchOutput.maps.map((mapping) => mapping.requirementId)).size !== matchOutput.maps.length ||
        matchOutput.maps.some(
          (mapping) =>
            !requirementIds.has(mapping.requirementId) ||
            mapping.claimIds.some((claimId) => !claims.has(claimId)) ||
            mapping.claimIds.length > 5 ||
            mapping.evidenceAssetIds.length > 0,
        )
      ) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      const providerMaps = new Map(matchOutput.maps.map((mapping) => [mapping.requirementId, mapping]));
      const maps = matchInput.requirements.map((requirement) => {
        const providerMap = providerMaps.get(requirement.id)!;
        const ranked = providerMap.claimIds
          .map((claimId) => ({ claim: claims.get(claimId)!, overlap: claimRelevance(requirement, claims.get(claimId)!) }))
          .sort((left, right) => right.overlap.length - left.overlap.length);
        if (ranked.some(({ claim, overlap }) => overlap.length === 0 || claim.status === "needs_evidence")) {
          throw new ProviderGatewayError("INVALID_RESPONSE");
        }
        const conflicts = ranked.filter(({ claim }) => claim.status === "conflicting");
        const usable = ranked.filter(({ claim }) => validFactClaim(claim));
        const threshold = Math.min(2, Math.max(1, requirement.keywords.length || extractKeywords(requirement.text).length));
        const status = conflicts.length
          ? "conflict"
          : usable[0]?.overlap.length >= threshold
            ? "met"
            : usable.length
              ? "partial"
              : "gap";
        const selected = (status === "conflict" ? conflicts : usable).slice(0, 3);
        const overlap = selected[0]?.overlap ?? [];
        return {
          requirementId: requirement.id,
          status,
          claimIds: selected.map(({ claim }) => claim.id),
          evidenceAssetIds: [],
          explanation:
            status === "met"
              ? `简历证据覆盖关键词：${overlap.join("、")}`
              : status === "partial"
                ? `存在相关经历，但只覆盖：${overlap.join("、")}`
                : status === "conflict"
                  ? "相关简历声明存在待核对冲突。"
                  : "当前简历中没有找到可追溯证据。",
          confidence: status === "gap" ? 0.62 : status === "partial" ? 0.65 : 0.75,
          suggestedAction:
            status === "gap"
              ? "如有真实经历，请补充具体行动与结果；没有则保留为能力缺口。"
              : status === "partial"
                ? "补充与该要求直接相关的方法或结果。"
                : undefined,
        } as const;
      });
      const totalWeight = matchInput.requirements.reduce((sum, requirement) => sum + requirement.importance, 0);
      const byRequirement = new Map(maps.map((mapping) => [mapping.requirementId, mapping]));
      const coveredWeight = matchInput.requirements.reduce((sum, requirement) => {
        const status = byRequirement.get(requirement.id)?.status;
        return sum + requirement.importance * (status === "met" ? 1 : status === "partial" ? 0.5 : 0);
      }, 0);
      return {
        ...matchOutput,
        maps,
        evidenceCoverageRate: totalWeight ? Math.round((coveredWeight / totalWeight) * 1_000) / 10 : 0,
        disclaimer: "证据覆盖率仅表示简历材料与岗位要求的适配程度，不代表录取或获得面试的概率。",
      } as unknown as GatewayOutputMap[K];
    }
    case "interview.plan": {
      const planInput = input as GatewayInputMap["interview.plan"];
      const planOutput = output as GatewayOutputMap["interview.plan"];
      const questions = new Map(planInput.questions.map((question) => [question.id, question]));
      if (
        planOutput.items.length !== Math.min(planInput.questionCount, planInput.questions.length) ||
        new Set(planOutput.items.map((item) => item.question.id)).size !== planOutput.items.length ||
        planOutput.items.some((item) => !questions.has(item.question.id))
      ) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      return {
        durationMinutes: planInput.durationMinutes,
        maxFollowUpsPerQuestion: planInput.maxFollowUpsPerQuestion,
        items: planOutput.items.map((item, index) => ({
          order: index + 1,
          question: questions.get(item.question.id)!,
          targetMinutes: item.targetMinutes,
        })),
      } as GatewayOutputMap[K];
    }
    case "answer.evaluate": {
      const answerInput = input as GatewayInputMap["answer.evaluate"];
      const evaluation = output as GatewayOutputMap["answer.evaluate"];
      const projectedAnswer = projector.redact(unwrapUntrustedDocumentText(answerInput.answer));
      const dimensionTotal = Object.values(evaluation.dimensions).reduce((sum, score) => sum + score, 0);
      if (
        evaluation.questionId !== answerInput.question.id ||
        evaluation.citedAnswerFragments.length > 5 ||
        evaluation.citedAnswerFragments.some(
          (fragment) => fragment.trim().length === 0 || !projectedAnswer.includes(fragment) || fragment.length > 500,
        ) ||
        evaluation.strengths.length > 8 ||
        evaluation.improvements.length > 8 ||
        [...evaluation.strengths, ...evaluation.improvements].some((item) => item.length > 500) ||
        (evaluation.followUpQuestion !== undefined && !answerInput.question.followUps.includes(evaluation.followUpQuestion)) ||
        Math.abs(evaluation.overallScore - dimensionTotal) > 0.2
      ) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      return { ...evaluation, overallScore: dimensionTotal } as GatewayOutputMap[K];
    }
    case "answer.coach": {
      const coachInput = input as GatewayInputMap["answer.coach"];
      const coachOutput = output as GatewayOutputMap["answer.coach"];
      const evaluationTotal = Object.values(coachInput.evaluation.dimensions).reduce((sum, score) => sum + score, 0);
      const outputStrings = [
        coachOutput.headline,
        ...coachOutput.actions,
        ...coachOutput.improvedOutline,
        coachOutput.factSafetyReminder,
      ];
      const sourceNumbers = numericTokens(unwrapUntrustedDocumentText(coachInput.answer));
      if (
        Math.abs(coachInput.evaluation.overallScore - evaluationTotal) > 0.2 ||
        coachOutput.headline.length < 1 ||
        coachOutput.headline.length > 300 ||
        coachOutput.actions.length < 1 ||
        coachOutput.actions.length > 5 ||
        coachOutput.improvedOutline.length < 2 ||
        coachOutput.improvedOutline.length > 8 ||
        new Set(coachOutput.actions).size !== coachOutput.actions.length ||
        outputStrings.some((item) => item.trim().length === 0 || item.length > 500) ||
        outputStrings.flatMap(numericTokens).some((number) => !sourceNumbers.includes(number)) ||
        !/(?:真实|核实|验证|不.{0,4}(?:编造|虚构)|verify|do not invent|never invent|fabricat)/iu.test(coachOutput.factSafetyReminder)
      ) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      return coachOutput as GatewayOutputMap[K];
    }
  }
}

const instructions: Record<ProviderGatewayCapabilityId, string> = {
  "resume.score": "Score only the supplied resume content. Evidence strings must be grounded in supplied sections or source blocks.",
  "resume.suggest": "Every suggestion must cite supplied sourceBlockIds or claimIds and use at most one replace JSON Pointer patch targeting an existing resume text field. Never add unsupported numbers or facts.",
  "jd.parse": "Parse only explicit job requirements. Preserve the supplied locale and do not infer employer facts.",
  "job.match": "Map every supplied requirement exactly once. Cite only supplied claim IDs and leave evidenceAssetIds empty.",
  "interview.plan": "Select and order only supplied question IDs. Do not invent or rewrite questions.",
  "answer.evaluate": "Evaluate only the supplied answer. Cited fragments must be exact substrings of the answer.",
  "answer.coach": "Give concrete coaching grounded only in the supplied answer and evaluation. Do not invent candidate facts.",
};

const schemas = {
  "resume.score": [ResumeScoreInputSchema, ResumeScoreOutputSchema],
  "resume.suggest": [ResumeSuggestInputSchema, ResumeSuggestOutputSchema],
  "jd.parse": [JdParseInputSchema, JdParseOutputSchema],
  "job.match": [JobMatchInputSchema, JobMatchOutputSchema],
  "interview.plan": [InterviewPlanInputSchema, InterviewPlanOutputSchema],
  "answer.evaluate": [AnswerEvaluateInputSchema, AnswerEvaluateOutputSchema],
  "answer.coach": [AnswerCoachInputSchema, AnswerCoachOutputSchema],
} as const;

function providerCapability<K extends ProviderGatewayCapabilityId>(
  id: K,
  gateway: OpenAiCompatibleGateway,
): Capability<GatewayInputMap[K], GatewayOutputMap[K]> {
  const [inputSchema, outputSchema] = schemas[id] as unknown as [
    z.ZodType<GatewayInputMap[K]>,
    z.ZodType<GatewayOutputMap[K]>,
  ];
  return {
    descriptor: {
      ...getCapabilityDescriptor(id),
      version: "2.0.0",
      provenance: "provider-gateway",
      networkPolicy: "provider_only",
    },
    inputSchema,
    outputSchema,
    async execute(input: GatewayInputMap[K], context: CapabilityContext) {
      const completion = await gateway.complete({
        capabilityId: id,
        context,
        dto: projectInput(id, input),
        outputSchema,
        instruction: instructions[id],
      });
      const data = validateOutput(id, input, completion.data);
      return {
        data,
        confidence: 0.76,
        evidenceReferences:
          id === "resume.suggest"
            ? [
                ...new Set(
                  (data as GatewayOutputMap["resume.suggest"]).suggestions.flatMap((suggestion) => [
                    ...suggestion.sourceBlockIds,
                    ...suggestion.claimIds,
                  ]),
                ),
              ]
            : [],
        usage: completion.usage,
      };
    },
  };
}

export function createProviderGatewayCapabilities(gateway: OpenAiCompatibleGateway): readonly GatewayCapability[] {
  return PROVIDER_GATEWAY_CAPABILITY_IDS.map(
    (id) => providerCapability(id, gateway) as unknown as GatewayCapability,
  );
}
