import { z } from "zod";

import { invokeBaselineCapability } from "@/lib/baseline";
import { AI_CAPABILITY_TIMEOUT_MS } from "@/lib/capabilities/catalog";
import {
  dedupeConsistencyWarnings,
  EvaluationResponseSchema,
} from "@/lib/client/contracts";
import { ClaimSchema, InterviewQuestionSchema } from "@/lib/domain";
import {
  unwrapUntrustedDocumentText,
  wrapUntrustedDocumentText,
} from "@/lib/baseline/utils";
import { createCapabilityContext } from "@/lib/server/analysis";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { invokeRequiredAiCapability } from "@/lib/server/capability-runtime";
import {
  jsonResponse,
  parseJsonBody,
  routeErrorResponse,
} from "@/lib/server/http";

export const runtime = "nodejs";

const QuestionRequestSchema = InterviewQuestionSchema.extend({
  id: z.string().min(1).max(200),
  prompt: z.string().trim().min(1).max(2_000),
  roleFamilies: z.array(z.string().trim().min(1).max(200)).max(20),
  skills: z.array(z.string().trim().min(1).max(200)).max(50),
  followUps: z.array(z.string().trim().min(1).max(2_000)).max(10),
  scoringAnchors: z.array(z.string().trim().min(1).max(500)).max(30),
  source: z.string().trim().min(1).max(500),
  referenceQuestionIds: z.array(z.string().min(1).max(200)).max(100),
});

const QuestionTextSchema = QuestionRequestSchema.pick({
  prompt: true,
  roleFamilies: true,
  skills: true,
  followUps: true,
  scoringAnchors: true,
});

const RequestSchema = z.object({
  resumeId: z.string().min(1).max(160),
  revision: z.number().int().nonnegative(),
  question: QuestionRequestSchema,
  answer: z.string().trim().min(1).max(20_000),
  claims: z.array(ClaimSchema).max(500),
});

function protectMetadataValues(
  values: string[],
  suspicious: boolean,
): string[] {
  return suspicious ? values.map(wrapUntrustedDocumentText) : values;
}

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, RequestSchema);
    await enforceAiRateLimit(request, "interview");
    const locale = input.question.locale;
    const securityContext = createCapabilityContext(
      locale,
      ["selected_text"],
      request.signal,
    );
    const questionText = QuestionTextSchema.parse(input.question);
    const [answerRedaction, questionRedaction] = await Promise.all([
      invokeBaselineCapability(
        "pii.redact",
        { text: input.answer },
        securityContext,
      ),
      invokeBaselineCapability(
        "pii.redact",
        { text: JSON.stringify(questionText) },
        securityContext,
      ),
    ]);
    const redactedQuestionText = QuestionTextSchema.parse(
      JSON.parse(questionRedaction.data.redactedText),
    );
    // Questions can contain model-generated or catalog-derived text, so their
    // metadata is guarded along with the answer instead of being trusted as
    // server-authored instructions.
    const [answerGuard, promptGuard, metadataGuard] = await Promise.all([
      invokeBaselineCapability(
        "prompt.guard",
        { text: answerRedaction.data.redactedText },
        securityContext,
      ),
      invokeBaselineCapability(
        "prompt.guard",
        { text: redactedQuestionText.prompt },
        securityContext,
      ),
      invokeBaselineCapability(
        "prompt.guard",
        { text: questionRedaction.data.redactedText },
        securityContext,
      ),
    ]);
    const protectMetadata = (values: string[]) =>
      protectMetadataValues(values, metadataGuard.data.suspicious);
    const question = InterviewQuestionSchema.parse({
      ...input.question,
      prompt: promptGuard.data.safeText,
      roleFamilies: protectMetadata(redactedQuestionText.roleFamilies),
      skills: protectMetadata(redactedQuestionText.skills),
      followUps: protectMetadata(redactedQuestionText.followUps),
      scoringAnchors: protectMetadata(redactedQuestionText.scoringAnchors),
    });
    const answerForCapabilities = answerGuard.data.safeText;
    const context = createCapabilityContext(
      locale,
      ["interview_content", "evidence_graph"],
      request.signal,
      AI_CAPABILITY_TIMEOUT_MS,
    );
    const [evaluationResult, consistencyResult] = await Promise.all([
      invokeRequiredAiCapability(
        "answer.evaluate",
        {
          question,
          answer: answerForCapabilities,
          expectedKeywords: [...question.skills, ...question.roleFamilies],
        },
        context,
      ),
      invokeBaselineCapability(
        "resumeInterview.check",
        { answer: answerRedaction.data.redactedText, claims: input.claims },
        context,
      ),
    ]);
    // Coaching depends on the exact accepted evaluation. The route publishes
    // neither result until evaluation, consistency checks, and coaching all
    // succeed, avoiding mismatched or partially generated feedback.
    const coaching = await invokeRequiredAiCapability(
      "answer.coach",
      {
        question,
        answer: answerForCapabilities,
        evaluation: evaluationResult.data,
      },
      context,
    );
    return jsonResponse(
      EvaluationResponseSchema.parse({
        sourceResumeId: input.resumeId,
        sourceResumeRevision: input.revision,
        evaluation: {
          ...evaluationResult.data,
          followUpQuestion:
            evaluationResult.data.followUpQuestion === undefined
              ? undefined
              : unwrapUntrustedDocumentText(
                  evaluationResult.data.followUpQuestion,
                ),
        },
        coaching: coaching.data,
        consistencyWarnings: dedupeConsistencyWarnings(
          consistencyResult.data.findings.map((finding) => finding.explanation),
        ),
        capabilityVersions: {
          "answer.evaluate": evaluationResult.sourceVersion,
          "answer.coach": coaching.sourceVersion,
        },
      }),
      {
        headers: {
          "x-capability-trace": [
            answerRedaction.sourceVersion,
            questionRedaction.sourceVersion,
            answerGuard.sourceVersion,
            promptGuard.sourceVersion,
            metadataGuard.sourceVersion,
            evaluationResult.sourceVersion,
            coaching.sourceVersion,
            consistencyResult.sourceVersion,
          ].join(","),
        },
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
