import { z } from "zod";

import { invokeBaselineCapability } from "@/lib/baseline";
import { dedupeConsistencyWarnings, EvaluationResponseSchema } from "@/lib/client/contracts";
import { ClaimSchema, InterviewQuestionSchema } from "@/lib/domain";
import { createCapabilityContext } from "@/lib/server/analysis";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { invokeCapability } from "@/lib/server/capability-runtime";
import { jsonResponse, parseJsonBody, routeErrorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

const RequestSchema = z.object({
  questionId: z.string().min(1).max(200),
  question: z.string().trim().min(1).max(2_000),
  answer: z.string().trim().min(10).max(20_000),
  claims: z.array(ClaimSchema).max(500),
});

function answerLocale(text: string) {
  const han = text.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return han > latin * 0.2 ? ("zh-CN" as const) : ("en-US" as const);
}

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, RequestSchema);
    await enforceAiRateLimit(request, "interview");
    const locale = answerLocale(`${input.question}\n${input.answer}`);
    const securityContext = createCapabilityContext(
      locale,
      ["selected_text"],
      request.signal,
    );
    const [answerRedaction, questionRedaction] = await Promise.all([
      invokeBaselineCapability("pii.redact", { text: input.answer }, securityContext),
      invokeBaselineCapability("pii.redact", { text: input.question }, securityContext),
    ]);
    const [answerGuard, questionGuard] = await Promise.all([
      invokeBaselineCapability("prompt.guard", { text: answerRedaction.data.redactedText }, securityContext),
      invokeBaselineCapability("prompt.guard", { text: questionRedaction.data.redactedText }, securityContext),
    ]);
    const question = InterviewQuestionSchema.parse({
      id: input.questionId,
      locale,
      prompt: questionGuard.data.safeText,
      category: "role",
      difficulty: "intermediate",
      roleFamilies: [],
      skills: [],
      followUps: [],
      scoringAnchors: [],
      source: "active-interview-plan",
      generated: true,
      referenceQuestionIds: [],
    });
    const answerForCapabilities = answerGuard.data.safeText;
    const context = createCapabilityContext(locale, ["interview_content", "evidence_graph"], request.signal);
    const [evaluationResult, consistencyResult] = await Promise.all([
      invokeCapability("answer.evaluate", { question, answer: answerForCapabilities, expectedKeywords: [] }, context),
      invokeBaselineCapability("resumeInterview.check", { answer: answerRedaction.data.redactedText, claims: input.claims }, context),
    ]);
    const coaching = await invokeCapability(
      "answer.coach",
      { question, answer: answerForCapabilities, evaluation: evaluationResult.data },
      context,
    );
    return jsonResponse(
      EvaluationResponseSchema.parse({
        evaluation: {
          ...evaluationResult.data,
          improvements: [...new Set([...evaluationResult.data.improvements, ...coaching.data.actions])],
        },
        consistencyWarnings: dedupeConsistencyWarnings(
          consistencyResult.data.findings.map((finding) => finding.explanation),
        ),
      }),
      {
        headers: {
          "x-capability-trace": [
            answerRedaction.sourceVersion,
            questionRedaction.sourceVersion,
            answerGuard.sourceVersion,
            questionGuard.sourceVersion,
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
