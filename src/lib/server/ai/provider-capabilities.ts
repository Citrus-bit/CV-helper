import "server-only";

import { z } from "zod";

import {
  AnswerCoachInputSchema,
  AnswerCoachOutputSchema,
  AnswerEvaluateInputSchema,
  AnswerEvaluateOutputSchema,
  CopyRewriteInputSchema,
  CopyRewriteOutputSchema,
  InterviewPlanInputSchema,
  InterviewPlanOutputSchema,
  JdParseInputSchema,
  JdParseOutputSchema,
  JobMatchInputSchema,
  JobMatchOutputSchema,
  ResumeScoreInputSchema,
  ResumeScoreOutputSchema,
  ResumeChatInputSchema,
  ResumeChatOutputSchema,
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
import {
  InterviewQuestionSchema,
  resolveResumeTextSourceBlocks,
  resolveResumeTextTarget,
  ScoreDimensionIdSchema,
  type Claim,
  type InterviewQuestion,
  type Suggestion,
} from "@/lib/domain";
import { resumeTextSafetyError } from "@/lib/resume-text-safety";

import { OpenAiCompatibleGateway, ProviderGatewayError } from "./provider-gateway";
import { PiiProjector } from "./pii-projection";

type GatewayInputMap = Pick<BaselineCapabilityInputMap, ProviderGatewayCapabilityId>;
type GatewayOutputMap = Pick<BaselineCapabilityOutputMap, ProviderGatewayCapabilityId>;
type GatewayCapability = Capability<GatewayInputMap[ProviderGatewayCapabilityId], GatewayOutputMap[ProviderGatewayCapabilityId]>;

const ProviderSuggestionSchema = z.object({
  kind: z.enum(["rewrite", "ask_user", "needs_proof"]),
  targetPath: z.string().startsWith("/"),
  originalText: z.string(),
  proposedText: z.string().optional(),
  rationale: z.string().min(1).max(1_500),
  question: z.string().min(1).max(1_000).optional(),
  claimIds: z.array(z.string()).max(20),
  affectedDimensions: z.array(ScoreDimensionIdSchema).max(6),
  factRisk: z.enum(["none", "low", "medium", "high"]),
  interviewRisk: z.enum(["none", "low", "medium", "high"]),
});

const ProviderSuggestionOutputSchema = z.object({
  suggestions: z.array(ProviderSuggestionSchema).max(16),
});

const INTERVIEW_PLAN_SOURCE = "interview.plan@2.0.0";

const ProviderInterviewQuestionSchema = InterviewQuestionSchema.extend({
  id: z.string().min(8).max(160),
  prompt: z.string().min(8).max(800),
  roleFamilies: z.array(z.string().min(1).max(120)).max(8),
  skills: z.array(z.string().min(1).max(120)).max(12),
  followUps: z.array(z.string().min(4).max(400)).max(2),
  scoringAnchors: z.array(z.string().min(2).max(300)).min(2).max(8),
  source: z.literal(INTERVIEW_PLAN_SOURCE),
  generated: z.literal(true),
  referenceQuestionIds: z.array(z.string().min(1).max(200)).min(1).max(8),
});

const ProviderInterviewPlanOutputSchema = z.object({
  durationMinutes: z.number().int().min(5).max(90),
  maxFollowUpsPerQuestion: z.number().int().min(0).max(2),
  items: z.array(
    z.object({
      order: z.number().int().positive(),
      question: ProviderInterviewQuestionSchema,
      targetMinutes: z.number().positive().max(90),
    }),
  ).min(1).max(20),
});

type ProviderSuggestion = z.infer<typeof ProviderSuggestionSchema>;
type EditableTarget = {
  path: string;
  originalText: string;
  localOriginalText: string;
  sourceBlockIds: string[];
  validClaimIds: string[];
};

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
  if (id !== "resume.score" && id !== "resume.suggest" && id !== "resume.chat") return new PiiProjector();
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

function assertNoProjectedPii(
  value: unknown,
  projector: PiiProjector,
  options: { checkAmbiguousContextNames?: boolean } = {},
): void {
  try {
    projector.assertSafe(value, options);
  } catch (cause) {
    throw new ProviderGatewayError("INVALID_RESPONSE", undefined, { cause });
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
  input:
    | GatewayInputMap["resume.score"]
    | GatewayInputMap["resume.suggest"]
    | GatewayInputMap["resume.chat"],
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

function editableTargets(
  input: GatewayInputMap["resume.suggest"],
  projector: PiiProjector,
): EditableTarget[] {
  const candidates: Array<{ path: string; text: string }> = [];
  if (input.resume.ast.summary) {
    candidates.push({ path: "/summary", text: input.resume.ast.summary });
  }
  input.resume.ast.sections.forEach((section, sectionIndex) => {
    if (section.text) {
      candidates.push({
        path: `/sections/${sectionIndex}/text`,
        text: section.text,
      });
    }
    section.entries.forEach((entry, entryIndex) => {
      if (entry.summary) {
        candidates.push({
          path: `/sections/${sectionIndex}/entries/${entryIndex}/summary`,
          text: entry.summary,
        });
      }
      entry.bullets.forEach((text, bulletIndex) => {
        candidates.push({
          path: `/sections/${sectionIndex}/entries/${entryIndex}/bullets/${bulletIndex}`,
          text,
        });
      });
    });
  });

  return candidates.flatMap(({ path, text }) => {
    const projectedText = projector.redact(text);
    // A target containing projected PII cannot be safely round-tripped into a
    // ready-to-apply rewrite, so it is excluded from automatic editing.
    if (projector.containsSensitiveValue(text)) return [];
    const sourceBlocks = resolveResumeTextSourceBlocks(
      input.resume,
      path,
      text,
    );
    if (sourceBlocks.length === 0) return [];
    const sourceIds = new Set(sourceBlocks.map((block) => block.id));
    return [
      {
        path,
        originalText: projectedText,
        localOriginalText: text,
        sourceBlockIds: [...sourceIds],
        validClaimIds: input.claims
          .filter(
            (claim) =>
              validFactClaim(claim) &&
              claim.sourceBlockIds.some((sourceId) => sourceIds.has(sourceId)),
          )
          .map((claim) => claim.id),
      },
    ];
  });
}

function resumeNaturalLanguagePayload(value: ReturnType<typeof minimalResume>) {
  return {
    sections: value.resume.sections.map((section) => ({
      title: section.title,
      text: section.text,
      entries: section.entries.map((entry) => ({
        title: entry.title,
        subtitle: entry.subtitle,
        organization: entry.organization,
        summary: entry.summary,
        bullets: entry.bullets,
        keywords: entry.keywords,
      })),
    })),
    sourceBlocks: value.resume.sourceBlocks.map((block) => block.text),
    claims: value.claims.map((claim) => claim.text),
  };
}

function projectedScoreContext(
  score: NonNullable<GatewayInputMap["resume.suggest"]["scoreContext"]>,
  sanitize: (value: string) => string,
) {
  return {
    resumeId: score.resumeId,
    resumeRevision: score.resumeRevision,
    total: score.total,
    summary: sanitize(score.summary),
    dimensions: score.dimensions.map((dimension) => ({
      id: dimension.id,
      label: sanitize(dimension.label),
      score: dimension.score,
      maxScore: dimension.maxScore,
      evidence: dimension.evidence.map(sanitize),
      deductions: dimension.deductions.map(sanitize),
    })),
  };
}

function projectedScoreNaturalLanguage(
  score: NonNullable<GatewayInputMap["resume.suggest"]["scoreContext"]>,
  sanitize: (value: string) => string,
) {
  const projected = projectedScoreContext(score, sanitize);
  return {
    summary: projected.summary,
    dimensions: projected.dimensions.map((dimension) => ({
      label: dimension.label,
      evidence: dimension.evidence,
      deductions: dimension.deductions,
    })),
  };
}

function providerInputPiiPayload<K extends ProviderGatewayCapabilityId>(
  id: K,
  input: GatewayInputMap[K],
  dto: unknown,
  projector: PiiProjector,
): unknown {
  if (id === "resume.score") {
    return resumeNaturalLanguagePayload(
      minimalResume(input as GatewayInputMap["resume.score"], projector),
    );
  }
  if (id === "resume.suggest") {
    const suggestionInput = input as GatewayInputMap["resume.suggest"];
    const sanitize = (value: string) => projector.redact(value);
    return {
      editableTargets: editableTargets(suggestionInput, projector).map(
        (target) => target.originalText,
      ),
      claims: suggestionInput.claims.map((claim) =>
        sanitize(claim.text),
      ),
      scoreContext: suggestionInput.scoreContext
        ? projectedScoreNaturalLanguage(suggestionInput.scoreContext, sanitize)
        : undefined,
    };
  }
  return dto;
}

function sensitivePayloadPaths(
  value: unknown,
  projector: PiiProjector,
  path = "$",
): string[] {
  if (typeof value === "string") {
    return projector.containsSensitiveValue(value) ? [path] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      sensitivePayloadPaths(item, projector, `${path}[${index}]`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      sensitivePayloadPaths(item, projector, `${path}.${key}`),
    );
  }
  return [];
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

function projectInput<K extends ProviderGatewayCapabilityId>(
  id: K,
  input: GatewayInputMap[K],
  projector: PiiProjector,
): unknown {
  const sanitize = (value: string) => projector.redact(value);
  switch (id) {
    case "resume.score":
      return minimalResume(input as GatewayInputMap["resume.score"], projector);
    case "resume.suggest": {
      const suggestionInput = input as GatewayInputMap["resume.suggest"];
      const projected = minimalResume(suggestionInput, projector);
      return {
        resume: {
          id: projected.resume.id,
          revision: projected.resume.revision,
          locale: projected.resume.locale,
        },
        claims: projected.claims,
        scoreContext: suggestionInput.scoreContext
          ? projectedScoreContext(suggestionInput.scoreContext, sanitize)
          : undefined,
        editableTargets: editableTargets(suggestionInput, projector).map(
          (target) => ({
            path: target.path,
            originalText: target.originalText,
            sourceBlockIds: target.sourceBlockIds,
            validClaimIds: target.validClaimIds,
          }),
        ),
      };
    }
    case "resume.chat": {
      const chatInput = input as GatewayInputMap["resume.chat"];
      return {
        ...minimalResume(chatInput, projector),
        conversation: {
          summary: sanitize(chatInput.summary),
          confirmedFacts: chatInput.confirmedFacts.map(sanitize),
          recentChanges: chatInput.recentChanges.map(sanitize),
          recentMessages: chatInput.recentMessages.map((message) => ({
            role: message.role,
            content: sanitize(message.content),
            resumeRevision: message.resumeRevision,
          })),
          latestUserMessage: sanitize(chatInput.userMessage),
        },
      };
    }
    case "jd.parse": {
      const jobInput = input as GatewayInputMap["jd.parse"];
      return {
        text: sanitize(jobInput.text),
        locale: jobInput.locale,
        title: jobInput.title ? sanitize(jobInput.title) : undefined,
        company: jobInput.company ? sanitize(jobInput.company) : undefined,
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
          eligibleClaimIds: matchInput.claims
            .filter(
              (claim) =>
                claim.status !== "needs_evidence" &&
                claimRelevance(requirement, claim).length > 0,
            )
            .map((claim) => claim.id),
        })),
        claims: matchInput.claims.map((claim) => minimalClaim(claim, sanitize)),
      };
    }
    case "copy.rewrite.zh":
    case "copy.rewrite.en": {
      const rewriteInput = input as GatewayInputMap["copy.rewrite.zh"];
      return {
        text: sanitize(rewriteInput.text),
        preserveTerms: rewriteInput.preserveTerms.map(sanitize),
      };
    }
    case "interview.plan": {
      const planInput = input as GatewayInputMap["interview.plan"];
      return {
        locale: planInput.locale,
        role: planInput.role ? sanitize(planInput.role) : undefined,
        skills: planInput.skills.map(sanitize),
        jobRequirements: planInput.jobRequirements.map(sanitize),
        durationMinutes: planInput.durationMinutes,
        questionCount: planInput.questionCount,
        maxFollowUpsPerQuestion: planInput.maxFollowUpsPerQuestion,
        referenceQuestions: planInput.questions.map((question) => ({
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
        evaluation: {
          ...coachInput.evaluation,
          strengths: coachInput.evaluation.strengths.map(sanitize),
          improvements: coachInput.evaluation.improvements.map(sanitize),
          citedAnswerFragments: coachInput.evaluation.citedAnswerFragments.map(sanitize),
          followUpQuestion: coachInput.evaluation.followUpQuestion === undefined
            ? undefined
            : sanitize(coachInput.evaluation.followUpQuestion),
        },
      };
    }
  }
}

function normalizedGroundingText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function compactQuestionText(value: string): string {
  return normalizedGroundingText(value).replace(/[\p{P}\p{S}\s]+/gu, "");
}

function questionTextSimilarity(left: string, right: string): number {
  const leftText = compactQuestionText(left);
  const rightText = compactQuestionText(right);
  if (!leftText || !rightText) return 0;
  if (leftText === rightText) return 1;
  const shorter = leftText.length <= rightText.length ? leftText : rightText;
  const longer = leftText.length > rightText.length ? leftText : rightText;
  if (shorter.length >= 8 && longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  const size = Math.min(3, leftText.length, rightText.length);
  const grams = (value: string) => {
    const result = new Set<string>();
    for (let index = 0; index <= value.length - size; index += 1) {
      result.add(value.slice(index, index + size));
    }
    return result;
  };
  const leftGrams = grams(leftText);
  const rightGrams = grams(rightText);
  const overlap = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
  return (2 * overlap) / (leftGrams.size + rightGrams.size);
}

function promptMatchesLocale(prompt: string, locale: GatewayInputMap["interview.plan"]["locale"]): boolean {
  const hasHan = /\p{Script=Han}/u.test(prompt);
  const hasLatin = /\p{Script=Latin}/u.test(prompt);
  if (locale === "en-US") return hasLatin && !hasHan;
  if (locale === "mixed") return hasHan && hasLatin;
  return hasHan;
}

function hasDuplicateText(values: readonly string[]): boolean {
  const normalized = values.map(normalizedGroundingText);
  return normalized.some((value, index) => !value || normalized.indexOf(value) !== index);
}

function providerSafeQuestionId(prompt: string, index: number): string {
  const ordinal = String.fromCharCode("a".charCodeAt(0) + index);
  return stableId(`interview_ai_${ordinal}`, prompt).replace(/\d/g, (digit) =>
    String.fromCharCode("k".charCodeAt(0) + Number(digit)),
  );
}

function generatedQuestionsContainPii(questions: readonly InterviewQuestion[]): boolean {
  const naturalLanguage = questions.map((question) => ({
    prompt: question.prompt,
    roleFamilies: question.roleFamilies,
    skills: question.skills,
    followUps: question.followUps,
    scoringAnchors: question.scoringAnchors,
  }));
  const serialized = JSON.stringify(naturalLanguage);
  const projected = new PiiProjector().redact(serialized);
  if (/\[(?:EMAIL|ID_NUMBER|LINK|NAME|ADDRESS)\]/u.test(projected)) return true;
  return /(?:电话|手机|手机号|联系电话|phone|mobile|tel(?:ephone)?)\s*[：:]?\s*\+?\d[\d\s().-]{5,}\d/iu.test(serialized);
}

class InterviewPlanOutputValidationError extends Error {
  constructor(readonly reasonCodes: readonly string[]) {
    super(reasonCodes.join(", "));
    this.name = "InterviewPlanOutputValidationError";
  }
}

function validateInterviewPlanOutput(
  input: GatewayInputMap["interview.plan"],
  output: GatewayOutputMap["interview.plan"],
): GatewayOutputMap["interview.plan"] {
  const reasonCodes = new Set<string>();
  const references = new Map(input.questions.map((question) => [question.id, question]));
  const referenceIds = new Set(references.keys());
  const expectedOrders = Array.from({ length: input.questionCount }, (_, index) => index + 1);
  const outputOrders = output.items.map((item) => item.order).sort((left, right) => left - right);
  const questions = output.items.map((item) => item.question);

  if (generatedQuestionsContainPii(questions)) reasonCodes.add("PII_OUTPUT");

  if (output.durationMinutes !== input.durationMinutes) reasonCodes.add("DURATION_MISMATCH");
  if (output.maxFollowUpsPerQuestion !== input.maxFollowUpsPerQuestion) {
    reasonCodes.add("FOLLOW_UP_LIMIT_MISMATCH");
  }
  if (output.items.length !== input.questionCount) reasonCodes.add("QUESTION_COUNT_MISMATCH");
  if (
    outputOrders.length !== expectedOrders.length ||
    outputOrders.some((order, index) => order !== expectedOrders[index])
  ) {
    reasonCodes.add("INVALID_ORDER_SEQUENCE");
  }
  if (new Set(questions.map((question) => question.id)).size !== questions.length) {
    reasonCodes.add("DUPLICATE_GENERATED_ID");
  }
  if (questions.some((question) => referenceIds.has(question.id))) {
    reasonCodes.add("REUSED_REFERENCE_ID");
  }
  if (new Set(questions.map((question) => compactQuestionText(question.prompt))).size !== questions.length) {
    reasonCodes.add("DUPLICATE_GENERATED_PROMPT");
  }

  for (const question of questions) {
    if (question.locale !== input.locale || !promptMatchesLocale(question.prompt, input.locale)) {
      reasonCodes.add("LOCALE_MISMATCH");
    }
    if (
      question.referenceQuestionIds.length === 0 ||
      question.referenceQuestionIds.some((id) => !referenceIds.has(id))
    ) {
      reasonCodes.add("UNKNOWN_OR_MISSING_REFERENCE_ID");
    }
    if (new Set(question.referenceQuestionIds).size !== question.referenceQuestionIds.length) {
      reasonCodes.add("DUPLICATE_REFERENCE_ID");
    }
    if (question.followUps.length > input.maxFollowUpsPerQuestion) {
      reasonCodes.add("TOO_MANY_FOLLOW_UPS");
    }
    if (
      hasDuplicateText(question.roleFamilies) ||
      hasDuplicateText(question.skills) ||
      hasDuplicateText(question.followUps) ||
      hasDuplicateText(question.scoringAnchors)
    ) {
      reasonCodes.add("DUPLICATE_OR_EMPTY_METADATA");
    }
    if (
      input.questions.some(
        (reference) => questionTextSimilarity(question.prompt, reference.prompt) >= 0.82,
      )
    ) {
      reasonCodes.add("COPIED_REFERENCE_PROMPT");
    }
  }

  const storyReferenceIds = new Set(
    input.questions
      .filter((question) => question.source.startsWith("resume-story-context@"))
      .map((question) => question.id),
  );
  const firstQuestion = output.items.find((item) => item.order === 1)?.question;
  if (
    storyReferenceIds.size > 0 &&
    (!firstQuestion ||
      firstQuestion.category !== "resume" ||
      !firstQuestion.referenceQuestionIds.some((id) => storyReferenceIds.has(id)))
  ) {
    reasonCodes.add("FIRST_QUESTION_NOT_STORY_GROUNDED");
  }

  if (reasonCodes.size > 0) {
    throw new InterviewPlanOutputValidationError([...reasonCodes]);
  }

  const ordered = output.items.slice().sort((left, right) => left.order - right.order);
  const totalWeight = ordered.reduce((sum, item) => sum + item.targetMinutes, 0);
  let allocated = 0;
  return {
    durationMinutes: input.durationMinutes,
    maxFollowUpsPerQuestion: input.maxFollowUpsPerQuestion,
    items: ordered.map((item, index) => {
      const targetMinutes = index === ordered.length - 1
        ? Math.max(0.1, Math.round((input.durationMinutes - allocated) * 10) / 10)
        : Math.max(0.1, Math.round((item.targetMinutes / totalWeight) * input.durationMinutes * 10) / 10);
      allocated += targetMinutes;
      return {
        order: index + 1,
        question: {
          ...item.question,
          id: providerSafeQuestionId(item.question.prompt, index),
          prompt: item.question.prompt.trim(),
          roleFamilies: item.question.roleFamilies.map((value) => value.trim()),
          skills: item.question.skills.map((value) => value.trim()),
          followUps: item.question.followUps.map((value) => value.trim()),
          scoringAnchors: item.question.scoringAnchors.map((value) => value.trim()),
          source: INTERVIEW_PLAN_SOURCE,
          generated: true,
        },
        targetMinutes,
      };
    }),
  };
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

const UNSUPPORTED_FACT_PATTERNS = [
  /(?:行业|全球|世界|全国|市场)(?:第一|领先|顶尖)|(?:第一|唯一|最佳)(?:名|家|个|款|位)?/iu,
  /(?:获奖|奖项|认证|专利|晋升|升职|录取|offer|award[- ]winning|patent(?:ed)?|promot(?:ed|ion)|certif(?:ied|ication)|best[- ]in[- ]class|world[- ]class|industry[- ]leading)/iu,
] as const;

const SAFE_REWRITE_FUNCTION_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "been", "being", "by", "for", "from", "in", "into", "is", "of", "on",
  "or", "the", "to", "via", "was", "were", "with",
]);
const SAFE_REWRITE_HAN_CHARACTERS = new Set(Array.from("的了和与及并在于以将把被对从为向"));

function factualLexemes(value: string): Set<string> {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const latin = normalized.match(/[\p{Script=Latin}][\p{Script=Latin}\p{N}+#.-]*/gu) ?? [];
  const han = normalized.match(/\p{Script=Han}/gu) ?? [];
  return new Set([
    ...latin.filter((token) => !SAFE_REWRITE_FUNCTION_WORDS.has(token)),
    ...han.filter((character) => !SAFE_REWRITE_HAN_CHARACTERS.has(character)),
  ]);
}

function validateCopyRewriteOutput(
  input: GatewayInputMap["copy.rewrite.zh"],
  output: GatewayOutputMap["copy.rewrite.zh"],
  projector: PiiProjector,
): GatewayOutputMap["copy.rewrite.zh"] {
  const projectedOriginal = projector.redact(input.text);
  const projectedTerms = input.preserveTerms.map((term) => projector.redact(term));
  const originalNumbers = numericTokens(projectedOriginal);
  const normalizedOriginal = normalizedGroundingText(projectedOriginal);
  const normalizedRewrite = normalizedGroundingText(output.rewritten);
  const originalLexemes = factualLexemes(projectedOriginal);
  const introducedLexemes = [...factualLexemes(output.rewritten)].filter((token) => !originalLexemes.has(token));
  const redactionChangedInput = projectedOriginal !== input.text.normalize("NFKC").trim();
  const introducedUnsupportedFact = UNSUPPORTED_FACT_PATTERNS.some(
    (pattern) => pattern.test(output.rewritten) && !pattern.test(projectedOriginal),
  );
  if (
    output.original !== projectedOriginal ||
    output.addedFacts !== false ||
    output.changes.length > 8 ||
    output.changes.some((change) => change.trim().length === 0 || change.length > 300) ||
    projectedTerms.some((term) => term.length > 0 && !output.rewritten.includes(term)) ||
    numericTokens(output.rewritten).some((number) => !originalNumbers.includes(number)) ||
    introducedLexemes.length > 0 ||
    introducedUnsupportedFact ||
    (normalizedOriginal.length > 0 && normalizedRewrite.length === 0) ||
    output.rewritten.length > Math.max(80, projectedOriginal.length * 2 + 40) ||
    output.rewritten.length > 4_000 ||
    resumeTextSafetyError(output.rewritten) !== null ||
    // Reversible PII tokens are intentionally not exposed to the provider. Preserve
    // the exact local text through the baseline instead of returning placeholders.
    redactionChangedInput
  ) {
    throw new ProviderGatewayError("INVALID_RESPONSE");
  }
  return {
    ...output,
    original: input.text,
  };
}

class SuggestionValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "SuggestionValidationError";
  }
}

function validateSuggestionCandidate(
  input: GatewayInputMap["resume.suggest"] | GatewayInputMap["resume.chat"],
  suggestion: Suggestion,
  claims: ReadonlyMap<string, Claim>,
  seenPaths: ReadonlySet<string>,
  confirmedFacts: readonly string[],
) {
  const reject = (reason: string): never => {
    throw new SuggestionValidationError(reason);
  };
  if (
    suggestion.claimIds.some((id) => !claims.has(id)) ||
    suggestion.patches.length !== 1
  ) {
    reject("INVALID_REFERENCE_OR_PATCH_COUNT");
  }
  const patch = suggestion.patches[0];
  if (
    patch.operation !== "replace" ||
    typeof patch.value !== "string" ||
    seenPaths.has(patch.path)
  ) {
    reject("INVALID_OR_DUPLICATE_PATCH");
  }
  const target =
    resolveResumeTextTarget(input.resume, patch.path) ??
    reject("UNKNOWN_PATCH_PATH");
  if (suggestion.originalText !== target.text) {
    reject("ORIGINAL_TEXT_DOES_NOT_MATCH_TARGET");
  }
  const sourceBlocks = resolveResumeTextSourceBlocks(
    input.resume,
    patch.path,
    suggestion.originalText,
  );
  if (sourceBlocks.length === 0) reject("SOURCE_TEXT_NOT_UNIQUELY_TRACEABLE");
  const targetSourceIds = sourceBlocks.map((block) => block.id);
  const replacement =
    typeof patch.value === "string"
      ? patch.value
      : reject("PATCH_VALUE_NOT_TEXT");
  if (
    replacement !== target.text &&
    resumeTextSafetyError(replacement) !== null
  ) {
    reject("UNSUPPORTED_EXPORT_CHARACTER");
  }
  const reconciledValue = replacement;
  const targetClaims = suggestion.claimIds
    .map((id) => claims.get(id))
    .filter(
      (claim): claim is Claim =>
        Boolean(claim) &&
        validFactClaim(claim!) &&
        claim!.sourceBlockIds.some((sourceId) =>
          targetSourceIds.includes(sourceId),
        ),
    );
  const supportedText = [
    target.text,
    ...targetClaims.map((claim) => claim.text),
    ...confirmedFacts,
  ].join(" ");
  const introducedNumbers = numericTokens(reconciledValue).filter(
    (number) => !numericTokens(supportedText).includes(number),
  );
  const supportedLexemes = factualLexemes(supportedText);
  const introducedLexemes = [...factualLexemes(reconciledValue)].filter(
    (lexeme) => !supportedLexemes.has(lexeme),
  );
  if (introducedNumbers.length || introducedLexemes.length) {
    reject(
      introducedNumbers.length ? "INTRODUCED_NUMBER" : "INTRODUCED_FACT_LEXEME",
    );
  }
  const hasUnsupportedClaim = suggestion.claimIds.some((id) => {
    const claim = claims.get(id);
    return !claim || !validFactClaim(claim);
  });
  if (
    (suggestion.factRisk === "medium" || suggestion.factRisk === "high") &&
    hasUnsupportedClaim &&
    reconciledValue !== target.text
  ) {
    reject("UNSUPPORTED_CLAIM_USED_IN_REWRITE");
  }
  if (
    (suggestion.kind === "needs_proof" || suggestion.kind === "ask_user") &&
    (!suggestion.question?.trim() || reconciledValue !== target.text)
  ) {
    reject("UNVERIFIED_SUGGESTION_IS_NOT_A_QUESTION");
  }
  if (
    suggestion.kind === "rewrite" &&
    suggestion.proposedText !== replacement
  ) {
    reject("PROPOSED_TEXT_PATCH_MISMATCH");
  }
  return {
    path: patch.path,
    suggestion: {
      ...suggestion,
      id: stableId(
        "suggestion-ai",
        `${input.resume.id}:${input.resume.revision}:${suggestion.kind}:${target.text}:${patch.path}`,
      ),
      resumeRevision: input.resume.revision,
      sourceBlockIds: targetSourceIds,
      originalText: target.text,
      proposedText:
        suggestion.kind === "rewrite"
          ? reconciledValue
          : suggestion.proposedText,
      beforeHash: stableId("hash", target.text),
      patches: [{ ...patch, value: reconciledValue }],
      status: "pending" as const,
    },
  };
}

function validateCanonicalSuggestionOutput(
  input: GatewayInputMap["resume.suggest"] | GatewayInputMap["resume.chat"],
  output: GatewayOutputMap["resume.suggest"],
  confirmedFacts: readonly string[] = [],
): GatewayOutputMap["resume.suggest"] {
  const claims = new Map(input.claims.map((claim) => [claim.id, claim]));
  const seenPaths = new Set<string>();
  const seenRationales = new Set<string>();
  const seenQuestions = new Set<string>();
  const suggestions: Suggestion[] = [];
  const actionable = output.suggestions.filter(
    (suggestion) => suggestion.kind !== "use_as_is",
  );

  for (const candidate of actionable) {
    if (suggestions.length >= 8) break;
    const rationaleKey = normalizedGroundingText(candidate.rationale);
    const questionKey = candidate.question
      ? normalizedGroundingText(candidate.question)
      : "";
    if (
      seenRationales.has(rationaleKey) ||
      (questionKey && seenQuestions.has(questionKey))
    ) {
      console.warn("ai_resume_suggestion_dropped", {
        reason: "DUPLICATE_ANALYSIS",
      });
      continue;
    }
    try {
      const validated = validateSuggestionCandidate(
        input,
        candidate,
        claims,
        seenPaths,
        confirmedFacts,
      );
      suggestions.push(validated.suggestion);
      seenPaths.add(validated.path);
      seenRationales.add(rationaleKey);
      if (questionKey) seenQuestions.add(questionKey);
    } catch (error) {
      if (!(error instanceof SuggestionValidationError)) throw error;
      console.warn("ai_resume_suggestion_dropped", { reason: error.reason });
    }
  }
  if (actionable.length > 0 && suggestions.length === 0) {
    throw new ProviderGatewayError("INVALID_RESPONSE");
  }
  return { suggestions };
}

class ProviderSuggestionOutputValidationError extends ProviderGatewayError {
  constructor(readonly reasonCounts: Readonly<Record<string, number>>) {
    super("INVALID_RESPONSE");
    this.name = "ProviderSuggestionOutputValidationError";
  }
}

class ProviderScoreOutputValidationError extends ProviderGatewayError {
  constructor(
    readonly reasonCodes: readonly string[],
    cause?: unknown,
  ) {
    super(
      "INVALID_RESPONSE",
      undefined,
      cause === undefined ? undefined : { cause },
    );
    this.name = "ProviderScoreOutputValidationError";
  }
}

function validateProviderSuggestionCandidate(
  input: GatewayInputMap["resume.suggest"],
  candidate: ProviderSuggestion,
  targets: ReadonlyMap<string, EditableTarget>,
  claims: ReadonlyMap<string, Claim>,
  seenPaths: ReadonlySet<string>,
  projector: PiiProjector,
): Suggestion {
  const reject = (reason: string): never => {
    throw new SuggestionValidationError(reason);
  };
  const target = targets.get(candidate.targetPath) ?? reject("UNKNOWN_TARGET_PATH");
  if (seenPaths.has(candidate.targetPath)) reject("DUPLICATE_TARGET_PATH");
  if (candidate.originalText !== target.originalText) {
    reject("ORIGINAL_TEXT_MISMATCH");
  }
  const validClaimIds = new Set(target.validClaimIds);
  if (candidate.claimIds.some((claimId) => !validClaimIds.has(claimId))) {
    reject("INVALID_CLAIM_ID");
  }
  assertNoProjectedPii(
    {
      originalText: candidate.originalText,
      proposedText: candidate.proposedText,
      rationale: candidate.rationale,
      question: candidate.question,
      claimTexts: candidate.claimIds.map((claimId) => claims.get(claimId)?.text ?? ""),
    },
    projector,
  );

  const isRewrite = candidate.kind === "rewrite";
  const replacement = isRewrite
    ? candidate.proposedText?.trim() || reject("INVALID_REWRITE")
    : target.localOriginalText;
  if (isRewrite && resumeTextSafetyError(replacement) !== null) {
    reject("UNSUPPORTED_EXPORT_CHARACTER");
  }
  if (
    isRewrite &&
    (replacement === target.originalText || candidate.question !== undefined)
  ) {
    reject("INVALID_REWRITE");
  }
  if (
    !isRewrite &&
    (!candidate.question?.trim() ||
      (candidate.proposedText !== undefined &&
        candidate.proposedText !== target.originalText))
  ) {
    reject("INVALID_QUESTION");
  }

  const supportedText = [
    target.originalText,
    ...candidate.claimIds.map((claimId) =>
      projector.redact(claims.get(claimId)!.text),
    ),
  ].join(" ");
  const introducedNumbers = numericTokens(replacement).filter(
    (number) => !numericTokens(supportedText).includes(number),
  );
  if (introducedNumbers.length > 0) reject("INTRODUCED_NUMBER");
  const supportedLexemes = factualLexemes(supportedText);
  if (
    [...factualLexemes(replacement)].some(
      (lexeme) => !supportedLexemes.has(lexeme),
    ) ||
    UNSUPPORTED_FACT_PATTERNS.some(
      (pattern) => pattern.test(replacement) && !pattern.test(supportedText),
    )
  ) {
    reject("INTRODUCED_FACT");
  }

  return {
    id: stableId(
      "suggestion-ai",
      `${input.resume.id}:${input.resume.revision}:${candidate.kind}:${target.localOriginalText}:${candidate.targetPath}`,
    ),
    resumeRevision: input.resume.revision,
    sourceBlockIds: target.sourceBlockIds,
    claimIds: candidate.claimIds,
    kind: candidate.kind,
    status: "pending",
    originalText: target.localOriginalText,
    proposedText: isRewrite ? replacement : undefined,
    rationale: candidate.rationale,
    question: candidate.question,
    beforeHash: stableId("hash", target.localOriginalText),
    patches: [
      {
        operation: "replace",
        path: target.path,
        value: replacement,
      },
    ],
    affectedDimensions: candidate.affectedDimensions,
    factRisk: candidate.factRisk,
    interviewRisk: candidate.interviewRisk,
  };
}

function validateProviderSuggestionOutput(
  input: GatewayInputMap["resume.suggest"],
  output: z.infer<typeof ProviderSuggestionOutputSchema>,
  projector: PiiProjector,
): GatewayOutputMap["resume.suggest"] {
  if (output.suggestions.length === 0) return { suggestions: [] };
  const targets = new Map(
    editableTargets(input, projector).map((target) => [target.path, target]),
  );
  const claims = new Map(input.claims.map((claim) => [claim.id, claim]));
  const seenPaths = new Set<string>();
  const seenRationales = new Set<string>();
  const seenQuestions = new Set<string>();
  const reasonCounts: Record<string, number> = {};
  const suggestions: Suggestion[] = [];
  const rejectCandidate = (reason: string) => {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  };

  for (const candidate of output.suggestions) {
    if (suggestions.length >= 8) break;
    const rationaleKey = normalizedGroundingText(candidate.rationale);
    const questionKey = candidate.question
      ? normalizedGroundingText(candidate.question)
      : "";
    if (
      seenRationales.has(rationaleKey) ||
      (questionKey && seenQuestions.has(questionKey))
    ) {
      rejectCandidate("DUPLICATE_ANALYSIS");
      continue;
    }
    try {
      const suggestion = validateProviderSuggestionCandidate(
        input,
        candidate,
        targets,
        claims,
        seenPaths,
        projector,
      );
      suggestions.push(suggestion);
      seenPaths.add(candidate.targetPath);
      seenRationales.add(rationaleKey);
      if (questionKey) seenQuestions.add(questionKey);
    } catch (error) {
      if (!(error instanceof SuggestionValidationError)) throw error;
      rejectCandidate(error.reason);
    }
  }
  if (suggestions.length === 0) {
    throw new ProviderSuggestionOutputValidationError(reasonCounts);
  }
  if (Object.keys(reasonCounts).length > 0) {
    console.info("ai_resume_suggestion_candidates_filtered", {
      invalidCandidateReasonCounts: reasonCounts,
    });
  }
  return { suggestions };
}

function validateOutput<K extends ProviderGatewayCapabilityId>(
  id: K,
  input: GatewayInputMap[K],
  output: GatewayOutputMap[K],
): GatewayOutputMap[K] {
  const projector = projectorForInput(id, input);
  const naturalLanguageOutput =
    id === "resume.score"
      ? (() => {
          const score = output as GatewayOutputMap["resume.score"];
          return {
            summary: score.summary,
            dimensions: score.dimensions.map((dimension) => ({
              label: dimension.label,
              evidence: dimension.evidence,
              deductions: dimension.deductions,
            })),
          };
        })()
      : id === "resume.chat"
        ? (() => {
            const chat = output as GatewayOutputMap["resume.chat"];
            return {
              reply: chat.reply,
              summary: chat.summary,
              confirmedFacts: chat.confirmedFacts,
              suggestions: chat.suggestions.map((suggestion) => ({
                originalText: suggestion.originalText,
                proposedText: suggestion.proposedText,
                rationale: suggestion.rationale,
                question: suggestion.question,
              })),
            };
          })()
        : output;
  try {
    assertNoProjectedPii(naturalLanguageOutput, projector, {
      checkAmbiguousContextNames: ![
        "job.match",
        "answer.evaluate",
        "answer.coach",
      ].includes(id),
    });
  } catch (error) {
    if (id === "resume.score") {
      console.warn("ai_resume_score_rejected", {
        reasonCodes: ["PII_OUTPUT"],
      });
      throw new ProviderScoreOutputValidationError(["PII_OUTPUT"], error);
    }
    console.warn("ai_provider_output_rejected", {
      capabilityId: id,
      reasonCodes: [
        error instanceof ProviderGatewayError && error.cause instanceof Error
          ? error.cause.message
          : "PII_OUTPUT",
      ],
    });
    throw error;
  }
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
      const dimensionIds = score.dimensions.map((dimension) => dimension.id);
      if (new Set(dimensionIds).size !== expectedMax.size) {
        console.warn("ai_resume_score_rejected", {
          reasonCodes: ["DUPLICATE_OR_MISSING_DIMENSION"],
        });
        throw new ProviderScoreOutputValidationError([
          "DUPLICATE_OR_MISSING_DIMENSION",
        ]);
      }
      const normalizationReasonCodes = [
        ...(score.resumeId !== scoreInput.resume.id
          ? ["RESUME_ID_REPLACED"]
          : []),
        ...(score.resumeRevision !== scoreInput.resume.revision
          ? ["RESUME_REVISION_REPLACED"]
          : []),
        ...(score.dimensions.some(
          (dimension) => expectedMax.get(dimension.id) !== dimension.maxScore,
        )
          ? ["DIMENSION_MAX_REPLACED"]
          : []),
      ];
      if (normalizationReasonCodes.length > 0) {
        console.info("ai_resume_score_normalized", {
          reasonCodes: normalizationReasonCodes,
        });
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
      const dimensions = score.dimensions.map((dimension) => {
        const maxScore = expectedMax.get(dimension.id)!;
        return {
          ...dimension,
          score: Math.min(dimension.score, maxScore),
          maxScore,
          evidence: dimension.evidence.filter((evidence) =>
            isGroundedFragment(evidence, groundedResume),
          ),
          label: dimensionLabels.get(dimension.id)!,
        };
      });
      const ordered = [...dimensions].sort(
        (left, right) => right.score / right.maxScore - left.score / left.maxScore,
      );
      const strongest = dimensionLabels.get(ordered[0].id)!;
      const weakest = dimensionLabels.get(ordered.at(-1)!.id)!;
      return {
        ...score,
        resumeId: scoreInput.resume.id,
        resumeRevision: scoreInput.resume.revision,
        total: dimensions.reduce((sum, dimension) => sum + dimension.score, 0),
        dimensions,
        summary:
          scoreInput.resume.locale === "en-US"
            ? `The resume is relatively stronger in ${strongest}; prioritize improving ${weakest}.`
            : `当前简历在${strongest}维度相对较好，建议优先改善${weakest}。`,
      } as GatewayOutputMap[K];
    }
    case "resume.chat": {
      const chatInput = input as GatewayInputMap["resume.chat"];
      const chatOutput = output as GatewayOutputMap["resume.chat"];
      const projectedUserMessage = projector.redact(chatInput.userMessage);
      const confirmedFacts = chatOutput.confirmedFacts.filter(
        (fact) => projectedUserMessage.includes(fact),
      );
      if (
        confirmedFacts.length !== chatOutput.confirmedFacts.length ||
        new Set(confirmedFacts).size !== confirmedFacts.length ||
        chatOutput.reply.length > 6_000 ||
        chatOutput.summary.length > 4_000 ||
        chatOutput.suggestions.length > 8
      ) {
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      const validatedSuggestions = validateCanonicalSuggestionOutput(
        chatInput,
        { suggestions: chatOutput.suggestions },
        [...chatInput.confirmedFacts, ...confirmedFacts],
      );
      return {
        ...chatOutput,
        confirmedFacts,
        suggestions: validatedSuggestions.suggestions,
      } as GatewayOutputMap[K];
    }
    case "resume.suggest":
      throw new ProviderGatewayError("INVALID_RESPONSE");
    case "jd.parse": {
      const jobInput = input as GatewayInputMap["jd.parse"];
      const jobOutput = output as GatewayOutputMap["jd.parse"];
      const sourceText = projector.redact(unwrapUntrustedDocumentText(jobInput.text));
      const expectedTitle = jobInput.title ? projector.redact(jobInput.title) : undefined;
      const expectedCompany = jobInput.company ? projector.redact(jobInput.company) : undefined;
      const expectedLocation = jobInput.location ? projector.redact(jobInput.location) : undefined;
      const groundedJobField = (value: string | undefined, expected: string | undefined) =>
        value === undefined || (expected ? normalizedGroundingText(value) === normalizedGroundingText(expected) : isGroundedFragment(value, sourceText));
      const rejectionReasons = new Set<string>();
      if (jobOutput.requirements.length > 30) {
        rejectionReasons.add("TOO_MANY_REQUIREMENTS");
      }
      if (
        new Set(jobOutput.requirements.map((requirement) => requirement.id))
          .size !== jobOutput.requirements.length
      ) {
        rejectionReasons.add("DUPLICATE_REQUIREMENT_ID");
      }
      if (jobOutput.jobPosting.locale !== jobInput.locale) {
        rejectionReasons.add("LOCALE_MISMATCH");
      }
      if (!groundedJobField(jobOutput.jobPosting.title, expectedTitle)) {
        rejectionReasons.add("TITLE_NOT_GROUNDED");
      }
      if (!groundedJobField(jobOutput.jobPosting.company, expectedCompany)) {
        rejectionReasons.add("COMPANY_NOT_GROUNDED");
      }
      if (!groundedJobField(jobOutput.jobPosting.location, expectedLocation)) {
        rejectionReasons.add("LOCATION_NOT_GROUNDED");
      }
      if (!groundedJobField(jobOutput.jobPosting.employmentType, undefined)) {
        rejectionReasons.add("EMPLOYMENT_TYPE_NOT_GROUNDED");
      }
      if (!groundedJobField(jobOutput.jobPosting.seniority, undefined)) {
        rejectionReasons.add("SENIORITY_NOT_GROUNDED");
      }
      for (const requirement of jobOutput.requirements) {
        if (requirement.jobPostingId !== jobOutput.jobPosting.id) {
          rejectionReasons.add("REQUIREMENT_JOB_ID_MISMATCH");
        }
        if (!isGroundedFragment(requirement.text, sourceText)) {
          rejectionReasons.add("REQUIREMENT_NOT_GROUNDED");
        }
        if (requirement.keywords.length > 12) {
          rejectionReasons.add("TOO_MANY_KEYWORDS");
        }
        if (
          requirement.keywords.some(
            (keyword) => !isGroundedFragment(keyword, requirement.text),
          )
        ) {
          rejectionReasons.add("KEYWORD_NOT_GROUNDED");
        }
      }
      if (rejectionReasons.size > 0) {
        console.warn("ai_jd_parse_rejected", {
          reasonCodes: [...rejectionReasons],
        });
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
      const structuralReasons = new Set<string>();
      if (matchOutput.maps.length !== requirementIds.size) {
        structuralReasons.add("MAPPING_COUNT_MISMATCH");
      }
      if (
        new Set(matchOutput.maps.map((mapping) => mapping.requirementId))
          .size !== matchOutput.maps.length
      ) {
        structuralReasons.add("DUPLICATE_REQUIREMENT_MAPPING");
      }
      for (const mapping of matchOutput.maps) {
        if (!requirementIds.has(mapping.requirementId)) {
          structuralReasons.add("UNKNOWN_REQUIREMENT_ID");
        }
        if (mapping.claimIds.some((claimId) => !claims.has(claimId))) {
          structuralReasons.add("UNKNOWN_CLAIM_ID");
        }
        if (mapping.claimIds.length > 3) {
          structuralReasons.add("TOO_MANY_CLAIMS");
        }
        if (mapping.evidenceAssetIds.length > 0) {
          structuralReasons.add("EVIDENCE_ASSET_ID_NOT_ALLOWED");
        }
        if (
          mapping.explanation.trim().length === 0 ||
          mapping.explanation.length > 800
        ) {
          structuralReasons.add("INVALID_EXPLANATION_LENGTH");
        }
        if (
          mapping.suggestedAction !== undefined &&
          (mapping.suggestedAction.trim().length === 0 ||
            mapping.suggestedAction.length > 500)
        ) {
          structuralReasons.add("INVALID_ACTION_LENGTH");
        }
      }
      if (structuralReasons.size > 0) {
        console.warn("ai_job_match_rejected", {
          reasonCodes: [...structuralReasons],
        });
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      const providerMaps = new Map(matchOutput.maps.map((mapping) => [mapping.requirementId, mapping]));
      const maps = matchInput.requirements.map((requirement) => {
        const providerMap = providerMaps.get(requirement.id)!;
        const ranked = providerMap.claimIds
          .map((claimId) => ({ claim: claims.get(claimId)!, overlap: claimRelevance(requirement, claims.get(claimId)!) }))
          .sort((left, right) => right.overlap.length - left.overlap.length);
        if (ranked.some(({ overlap }) => overlap.length === 0)) {
          console.warn("ai_job_match_rejected", {
            reasonCodes: ["CITED_CLAIM_NOT_RELEVANT"],
          });
          throw new ProviderGatewayError("INVALID_RESPONSE");
        }
        if (ranked.some(({ claim }) => claim.status === "needs_evidence")) {
          console.warn("ai_job_match_rejected", {
            reasonCodes: ["CITED_CLAIM_NEEDS_EVIDENCE"],
          });
          throw new ProviderGatewayError("INVALID_RESPONSE");
        }
        const conflicts = ranked.filter(({ claim }) => claim.status === "conflicting");
        const usable = ranked.filter(({ claim }) => validFactClaim(claim));
        const status = providerMap.status;
        const selected =
          status === "conflict"
            ? conflicts
            : status === "gap"
              ? []
              : usable;
        const selectedIds = new Set(selected.map(({ claim }) => claim.id));
        const sourceNumbers = numericTokens(
          [requirement.text, ...selected.map(({ claim }) => claim.text)].join(
            " ",
          ),
        );
        const providerNarrative = [
          providerMap.explanation,
          providerMap.suggestedAction ?? "",
        ].join(" ");
        const rejectionReasons = new Set<string>();
        if (
          selected.length !== providerMap.claimIds.length ||
          providerMap.claimIds.some((claimId) => !selectedIds.has(claimId))
        ) {
          rejectionReasons.add("CITED_CLAIM_STATUS_MISMATCH");
        }
        if (status === "gap" && ranked.length > 0) {
          rejectionReasons.add("GAP_CITES_CLAIM");
        }
        if (status === "conflict" && conflicts.length === 0) {
          rejectionReasons.add("CONFLICT_WITHOUT_CONFLICTING_CLAIM");
        }
        if (
          (status === "met" || status === "partial") &&
          usable.length === 0
        ) {
          rejectionReasons.add("COVERAGE_WITHOUT_USABLE_CLAIM");
        }
        if (
          (status === "met" || status === "partial") &&
          conflicts.length > 0
        ) {
          rejectionReasons.add("COVERAGE_CITES_CONFLICTING_CLAIM");
        }
        if (
          numericTokens(providerNarrative).some(
            (number) => !sourceNumbers.includes(number),
          )
        ) {
          rejectionReasons.add("NARRATIVE_ADDS_NUMBER");
        }
        if (rejectionReasons.size > 0) {
          console.warn("ai_job_match_rejected", {
            reasonCodes: [...rejectionReasons],
          });
          throw new ProviderGatewayError("INVALID_RESPONSE");
        }
        return {
          requirementId: requirement.id,
          status,
          claimIds: selected.map(({ claim }) => claim.id),
          evidenceAssetIds: [],
          explanation: providerMap.explanation.trim(),
          confidence: providerMap.confidence,
          suggestedAction: providerMap.suggestedAction?.trim(),
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
    case "copy.rewrite.zh":
    case "copy.rewrite.en":
      return validateCopyRewriteOutput(
        input as GatewayInputMap["copy.rewrite.zh"],
        output as GatewayOutputMap["copy.rewrite.zh"],
        projector,
      ) as GatewayOutputMap[K];
    case "interview.plan": {
      return validateInterviewPlanOutput(
        input as GatewayInputMap["interview.plan"],
        output as GatewayOutputMap["interview.plan"],
      ) as GatewayOutputMap[K];
    }
    case "answer.evaluate": {
      const answerInput = input as GatewayInputMap["answer.evaluate"];
      const evaluation = output as GatewayOutputMap["answer.evaluate"];
      const projectedAnswer = projector.redact(unwrapUntrustedDocumentText(answerInput.answer));
      const dimensionTotal = Object.values(evaluation.dimensions).reduce((sum, score) => sum + score, 0);
      const rejectionReasons = new Set<string>();
      if (evaluation.questionId !== answerInput.question.id) {
        rejectionReasons.add("QUESTION_ID_MISMATCH");
      }
      if (evaluation.citedAnswerFragments.length > 5) {
        rejectionReasons.add("TOO_MANY_CITATIONS");
      }
      if (
        evaluation.citedAnswerFragments.some(
          (fragment) =>
            fragment.trim().length === 0 ||
            !projectedAnswer.includes(fragment) ||
            fragment.length > 500,
        )
      ) {
        rejectionReasons.add("INVALID_ANSWER_CITATION");
      }
      if (evaluation.strengths.length > 8) {
        rejectionReasons.add("TOO_MANY_STRENGTHS");
      }
      if (evaluation.improvements.length > 8) {
        rejectionReasons.add("TOO_MANY_IMPROVEMENTS");
      }
      if (
        [...evaluation.strengths, ...evaluation.improvements].some(
          (item) => item.length > 500,
        )
      ) {
        rejectionReasons.add("FEEDBACK_TEXT_TOO_LONG");
      }
      if (
        evaluation.followUpQuestion !== undefined &&
        !evaluation.followUpQuestion.trim()
      ) {
        rejectionReasons.add("EMPTY_FOLLOW_UP");
      }
      if (rejectionReasons.size > 0) {
        console.warn("ai_answer_evaluate_rejected", {
          reasonCodes: [...rejectionReasons],
        });
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      if (Math.abs(evaluation.overallScore - dimensionTotal) > 0.2) {
        console.info("ai_answer_evaluate_normalized", {
          reasonCodes: ["OVERALL_SCORE_RECOMPUTED"],
        });
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
      const rejectionReasons = new Set<string>();
      if (
        Math.abs(coachInput.evaluation.overallScore - evaluationTotal) > 0.2
      ) {
        rejectionReasons.add("EVALUATION_SCORE_MISMATCH");
      }
      if (
        coachOutput.headline.length < 1 ||
        coachOutput.headline.length > 300
      ) {
        rejectionReasons.add("INVALID_HEADLINE_LENGTH");
      }
      if (coachOutput.actions.length < 1 || coachOutput.actions.length > 5) {
        rejectionReasons.add("INVALID_ACTION_COUNT");
      }
      if (
        coachOutput.improvedOutline.length < 2 ||
        coachOutput.improvedOutline.length > 8
      ) {
        rejectionReasons.add("INVALID_OUTLINE_COUNT");
      }
      if (new Set(coachOutput.actions).size !== coachOutput.actions.length) {
        rejectionReasons.add("DUPLICATE_ACTION");
      }
      if (
        outputStrings.some(
          (item) => item.trim().length === 0 || item.length > 500,
        )
      ) {
        rejectionReasons.add("INVALID_TEXT_LENGTH");
      }
      if (
        outputStrings
          .flatMap(numericTokens)
          .some((number) => !sourceNumbers.includes(number))
      ) {
        rejectionReasons.add("COACHING_ADDS_NUMBER");
      }
      if (
        !/(?:真实|核实|验证|不.{0,4}(?:编造|虚构)|verify|do not invent|never invent|fabricat)/iu.test(
          coachOutput.factSafetyReminder,
        )
      ) {
        rejectionReasons.add("MISSING_FACT_SAFETY_REMINDER");
      }
      if (rejectionReasons.size > 0) {
        console.warn("ai_answer_coach_rejected", {
          reasonCodes: [...rejectionReasons],
        });
        throw new ProviderGatewayError("INVALID_RESPONSE");
      }
      return coachOutput as GatewayOutputMap[K];
    }
  }
}

export const providerInstructions: Record<ProviderGatewayCapabilityId, string> = {
  "resume.score": [
    "Score only the supplied resume content.",
    "Return exactly these six dimensions and maxima: impact 25, completeness 15, clarity 15, structure 15, ats 15, language 15.",
    "Each score must be between zero and its dimension maximum, and total must equal the sum of all six scores.",
    "Every evidence string must be an exact verbatim substring of a supplied section, claim, or source block; put interpretation only in deductions.",
    "Never output or infer any person's name, email, phone number, URL, postal or residential address, or exact location, even if the input contains a redaction token. Do not use name, contact, address, or location labels; refer only to the resume or candidate generically.",
  ].join(" "),
  "resume.suggest": [
    "Task: act as a senior resume editor and return only the most important actionable findings from the supplied editableTargets, ordered by recruiter impact, with at most 8 suggestions.",
    "scoreContext is the validated result of the immediately preceding independent resume.score request. Use it as read-only context to prioritize suggestions and avoid contradicting that assessment.",
    "For every item, diagnose that exact sentence rather than applying a generic checklist. rationale must identify the concrete wording or information issue in originalText, explain its effect on a recruiter, and state what the proposed change improves. Do not reuse stock rationales, repeated sentence templates, or the same question across unrelated bullets.",
    "When a fact-preserving improvement is possible, return kind rewrite with a complete, ready-to-paste replacement sentence. Prefer concise action-method-result ordering and remove weak, repetitive, or vague phrasing, but do not demand a metric when the source contains none.",
    "Use ask_user or needs_proof only when a specific missing or unsupported fact materially blocks a useful edit. question must name the exact project, action, result, or phrase that needs clarification and must not be a generic request for metrics.",
    "Choose targetPath only from editableTargets.path. originalText must exactly equal that target's originalText, including punctuation and whitespace. Cite only claimIds listed in that target's validClaimIds.",
    "Preserve meaningful line breaks, numbered-item boundaries, and structural labels such as 技术栈： or 核心职责与实现： in proposedText. Never merge visually separate modules into one sentence.",
    "Do not generate IDs, revision values, statuses, hashes, sourceBlockIds, or patches; the server creates all system fields after validation.",
    "A rewrite may only rearrange factual words already present in originalText or cited valid claims; never introduce new numbers, achievements, responsibilities, tools, credentials, ranking, business scope, or implied ownership.",
    "proposedText must use export-safe plain text. Never output placeholder squares, replacement characters, private-use glyphs, emoji, or invisible control and formatting characters.",
    "Omit bullets that are already strong or do not have a material, fully supported improvement; do not return use_as_is placeholders.",
  ].join(" "),
  "resume.chat": [
    "Task: continue an editing conversation about the supplied current resume. The conversation.latestUserMessage is the user's current request; use the summary, recent messages, confirmed facts, recent changes, resume sections, and claims as context.",
    "Reply directly and specifically in the resume locale. Explain what you understood, answer questions about the resume, ask one precise clarification only when a missing fact blocks the requested edit, and never use generic resume-advice boilerplate.",
    "Return a concise updated summary that preserves durable user preferences, unresolved questions, confirmed facts, and important editing decisions from the previous summary and this turn. Do not copy the whole transcript.",
    "confirmedFacts may contain only exact verbatim substrings of latestUserMessage that are affirmative first-person facts supplied by the user. Do not treat hypotheticals, examples, questions, negations, or instructions to omit content as facts.",
    "Return suggestions only when the user requested a concrete change that can be applied safely. Each suggestion must follow all resume.suggest patch, citation, originalText, proposedText, and factual-grounding rules and target the current resume revision.",
    "A rewrite may use only facts in the current target text, cited valid claims, conversation.confirmedFacts, or this turn's confirmedFacts. Never invent or infer numbers, achievements, responsibilities, tools, credentials, rankings, business scope, dates, or ownership.",
    "If the user asks for analysis or discussion without requesting a change, return no suggestions. Limit suggestions to the smallest set needed for the latest request, at most eight.",
  ].join(" "),
  "jd.parse": "Parse only explicit job requirements. Every requirement text must be a verbatim contiguous excerpt of the supplied text, and every keyword must be a verbatim contiguous excerpt of its requirement text. When title, company, or location is supplied, return that value exactly; otherwise omit optional job fields unless their value is a verbatim excerpt of the supplied text. Preserve the supplied locale, use unique IDs, keep every requirement jobPostingId equal to the returned jobPosting id, and do not infer or paraphrase employer facts.",
  "job.match": "Map every supplied requirement exactly once. Decide met, partial, gap, or conflict from the supplied requirement and claims. For each requirement, claimIds must be a subset of that requirement eligibleClaimIds: cite at most three, cite none and use gap when the list is empty or no eligible claim supports coverage, and use conflict only when the cited eligible claim status is conflicting. Never cite a claim based only on broad semantic similarity without the server-computed lexical evidence. Leave evidenceAssetIds empty. Write a concise requirement-specific explanation for every mapping and a concrete requirement-specific suggestedAction when useful. Do not reuse stock explanations across unrelated requirements, do not invent facts or numbers, and do not mention evidence outside the cited claims.",
  "copy.rewrite.zh": "Rewrite the supplied Chinese text as one concise, coherent resume paragraph in professional language. When the input contains multiple fragments, combine them and remove conversational filler while preserving every explicit fact. Preserve every preserveTerms value exactly, keep all numbers unchanged, and do not add achievements, scope, credentials, rankings, or any other facts. Use export-safe plain text only: no placeholder squares, replacement characters, private-use glyphs, emoji, or invisible control and formatting characters. Set original to the supplied text and addedFacts to false.",
  "copy.rewrite.en": "Rewrite the supplied English text as one concise, coherent resume paragraph in professional language. When the input contains multiple fragments, combine them and remove conversational filler while preserving every explicit fact. Preserve every preserveTerms value exactly, keep all numbers unchanged, and do not add achievements, scope, credentials, rankings, or any other facts. Use export-safe plain text only: no placeholder squares, replacement characters, private-use glyphs, emoji, or invisible control and formatting characters. Set original to the supplied text and addedFacts to false.",
  "interview.plan": [
    "Task: generate the final interview plan. The supplied referenceQuestions, role, skills, and jobRequirements are context only; never return a reference question as the final question.",
    "Create exactly questionCount newly worded questions in the supplied locale. Every final question must have a unique new id that is not any reference id, generated true, source interview.plan@2.0.0, and one to eight referenceQuestionIds chosen only from supplied reference question ids.",
    "Do not copy or lightly edit any reference prompt. Make each prompt materially different and specific to the supplied role, resume skills, job requirements, or resume story context without inventing candidate facts.",
    "Use only the allowed category and difficulty values. Keep roleFamilies to at most eight, skills to at most twelve, scoringAnchors to two through eight concise items, and followUps at or below maxFollowUpsPerQuestion. Keep all lists unique.",
    "Use order values 1 through questionCount exactly once, preserve durationMinutes and maxFollowUpsPerQuestion exactly, and assign a positive targetMinutes to every item.",
    "When any referenceQuestion source starts with resume-story-context@, order 1 must be a newly generated resume-category question that references at least one such story reference id.",
  ].join(" "),
  "answer.evaluate": "Evaluate only the supplied answer. Cited fragments must be non-empty exact substrings of the answer. Set questionId exactly to the supplied question id, return at most five cited fragments and at most eight strengths and improvements, and set overallScore to the exact sum of the five dimension scores.",
  "answer.coach": "Give concrete coaching grounded only in the supplied answer and evaluation. Return one concise headline, one to five unique actions, and two to eight improvedOutline items. Do not output any number that does not appear exactly in the answer. The factSafetyReminder must explicitly tell the candidate to use only real or verifiable facts and not invent facts. Do not invent candidate facts.",
};

const schemas = {
  "resume.score": [ResumeScoreInputSchema, ResumeScoreOutputSchema],
  "resume.suggest": [ResumeSuggestInputSchema, ResumeSuggestOutputSchema],
  "resume.chat": [ResumeChatInputSchema, ResumeChatOutputSchema],
  "jd.parse": [JdParseInputSchema, JdParseOutputSchema],
  "job.match": [JobMatchInputSchema, JobMatchOutputSchema],
  "copy.rewrite.zh": [CopyRewriteInputSchema, CopyRewriteOutputSchema],
  "copy.rewrite.en": [CopyRewriteInputSchema, CopyRewriteOutputSchema],
  "interview.plan": [InterviewPlanInputSchema, InterviewPlanOutputSchema],
  "answer.evaluate": [AnswerEvaluateInputSchema, AnswerEvaluateOutputSchema],
  "answer.coach": [AnswerCoachInputSchema, AnswerCoachOutputSchema],
} as const;

async function completeProviderScore(
  gateway: OpenAiCompatibleGateway,
  input: GatewayInputMap["resume.score"],
  context: CapabilityContext,
  projector: PiiProjector,
  dto: unknown,
) {
  let correctionReasonCodes: string[] | undefined;
  for (const generationAttempt of [1, 2] as const) {
    const startedAt = performance.now();
    try {
      const completion = await gateway.complete({
        capabilityId: "resume.score",
        context,
        dto,
        piiPayload: providerInputPiiPayload(
          "resume.score",
          input,
          dto,
          projector,
        ),
        outputSchema: ResumeScoreOutputSchema,
        instruction: providerInstructions["resume.score"],
        generationAttempt,
        correctionReasonCodes,
      });
      return {
        data: validateOutput("resume.score", input, completion.data),
        usage: completion.usage,
      };
    } catch (error) {
      const reasonCodes =
        error instanceof ProviderScoreOutputValidationError
          ? [...error.reasonCodes]
          : error instanceof ProviderGatewayError &&
              error.code === "INVALID_RESPONSE" &&
              (error.status === 200 || error.status === undefined)
            ? [
                error.status === 200
                  ? "INVALID_RESPONSE_SCHEMA"
                  : "INVALID_SCORE_OUTPUT",
              ]
            : null;
      if (!reasonCodes || generationAttempt === 2) throw error;
      gateway.recordInvalidCandidates({
        capabilityId: "resume.score",
        context,
        generationAttempt,
        format: "json_object",
        reasonCounts: Object.fromEntries(
          reasonCodes.map((reasonCode) => [reasonCode, 1]),
        ),
        durationMs: Math.max(0, performance.now() - startedAt),
      });
      correctionReasonCodes = reasonCodes;
    }
  }
  throw new ProviderGatewayError("INVALID_RESPONSE");
}

async function completeProviderInterviewPlan(
  gateway: OpenAiCompatibleGateway,
  input: GatewayInputMap["interview.plan"],
  context: CapabilityContext,
  dto: unknown,
  piiPayload: unknown,
) {
  let correctionReasonCodes: string[] | undefined;
  for (const generationAttempt of [1, 2] as const) {
    const startedAt = performance.now();
    try {
      const completion = await gateway.complete({
        capabilityId: "interview.plan",
        context,
        dto,
        piiPayload,
        outputSchema: ProviderInterviewPlanOutputSchema,
        instruction: providerInstructions["interview.plan"],
        generationAttempt,
        correctionReasonCodes,
      });
      return {
        data: validateInterviewPlanOutput(input, completion.data),
        usage: completion.usage,
      };
    } catch (error) {
      const reasonCodes =
        error instanceof InterviewPlanOutputValidationError
          ? [...error.reasonCodes]
          : error instanceof ProviderGatewayError && error.code === "INVALID_RESPONSE"
            ? ["INVALID_RESPONSE_SCHEMA"]
            : null;
      if (!reasonCodes) throw error;
      if (generationAttempt === 2) {
        throw new ProviderGatewayError("INVALID_RESPONSE", undefined, { cause: error });
      }
      gateway.recordInvalidCandidates({
        capabilityId: "interview.plan",
        context,
        generationAttempt,
        format: "json_object",
        reasonCounts: Object.fromEntries(reasonCodes.map((reasonCode) => [reasonCode, 1])),
        durationMs: Math.max(0, performance.now() - startedAt),
      });
      correctionReasonCodes = reasonCodes;
    }
  }
  throw new ProviderGatewayError("INVALID_RESPONSE");
}

async function completeProviderSuggestions(
  gateway: OpenAiCompatibleGateway,
  input: GatewayInputMap["resume.suggest"],
  context: CapabilityContext,
  projector: PiiProjector,
  dto: unknown,
) {
  let correctionReasonCodes: string[] | undefined;
  for (const generationAttempt of [1, 2] as const) {
    const startedAt = performance.now();
    try {
      const completion = await gateway.complete({
        capabilityId: "resume.suggest",
        context,
        dto,
        piiPayload: providerInputPiiPayload(
          "resume.suggest",
          input,
          dto,
          projector,
        ),
        outputSchema: ProviderSuggestionOutputSchema,
        instruction: providerInstructions["resume.suggest"],
        generationAttempt,
        correctionReasonCodes,
      });
      const data = validateProviderSuggestionOutput(
        input,
        completion.data,
        projector,
      );
      return { data, usage: completion.usage };
    } catch (error) {
      const reasonCounts =
        error instanceof ProviderSuggestionOutputValidationError
          ? error.reasonCounts
          : error instanceof ProviderGatewayError &&
              error.code === "INVALID_RESPONSE" &&
              (error.status === 200 || error.status === undefined)
            ? {
                [error.status === 200
                  ? "INVALID_RESPONSE_SCHEMA"
                  : "PII_OR_FACT_SAFETY_REJECTION"]: 1,
              }
            : null;
      if (!reasonCounts || generationAttempt === 2) throw error;
      gateway.recordInvalidCandidates({
        capabilityId: "resume.suggest",
        context,
        generationAttempt,
        format: "json_object",
        reasonCounts,
        durationMs: Math.max(0, performance.now() - startedAt),
      });
      correctionReasonCodes = Object.keys(reasonCounts);
    }
  }
  throw new ProviderGatewayError("INVALID_RESPONSE");
}

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
      const projector = projectorForInput(id, input);
      const dto = projectInput(id, input, projector);
      const piiPayload = providerInputPiiPayload(id, input, dto, projector);
      try {
        projector.assertSafe(piiPayload);
      } catch (cause) {
        console.warn("ai_provider_input_rejected", {
          capabilityId: id,
          reasonCode:
            cause instanceof Error ? cause.message : "UNKNOWN_PII_PATTERN",
          fieldPaths: sensitivePayloadPaths(piiPayload, projector).slice(0, 12),
        });
        throw new ProviderGatewayError("UNSAFE_INPUT", undefined, { cause });
      }
      const completion =
        id === "resume.suggest"
          ? await completeProviderSuggestions(
              gateway,
              input as GatewayInputMap["resume.suggest"],
              context,
              projector,
              dto,
            )
          : id === "interview.plan"
            ? await completeProviderInterviewPlan(
                gateway,
                input as GatewayInputMap["interview.plan"],
                context,
                dto,
                piiPayload,
              )
          : id === "resume.score"
            ? await completeProviderScore(
                gateway,
                input as GatewayInputMap["resume.score"],
                context,
                projector,
                dto,
              )
          : await gateway.complete({
              capabilityId: id,
              context,
              dto,
              piiPayload,
              outputSchema,
              instruction: providerInstructions[id],
            });
      const data =
        id === "resume.suggest" || id === "resume.score" || id === "interview.plan"
          ? (completion.data as GatewayOutputMap[K])
          : validateOutput(id, input, completion.data as GatewayOutputMap[K]);
      return {
        data,
        confidence: 0.76,
        evidenceReferences:
          id === "resume.suggest" || id === "resume.chat"
            ? [
                ...new Set(
                  (data as GatewayOutputMap["resume.suggest"] | GatewayOutputMap["resume.chat"]).suggestions.flatMap((suggestion) => [
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
