import { z } from "zod";

import { invokeBaselineCapability } from "@/lib/baseline";
import { AI_CAPABILITY_TIMEOUT_MS } from "@/lib/capabilities/catalog";
import { InterviewPlanSchema } from "@/lib/client/contracts";
import {
  ClaimSchema,
  InterviewQuestionSchema,
  InterviewStorySchema,
  ResumeASTSchema,
  type InterviewQuestion,
} from "@/lib/domain";
import { createCapabilityContext } from "@/lib/server/analysis";
import { enforceAiRateLimit } from "@/lib/server/ai-rate-limit";
import { invokeCapability } from "@/lib/server/capability-runtime";
import { jsonResponse, parseJsonBody, routeErrorResponse } from "@/lib/server/http";
import { loadInterviewQuestionCatalog } from "@/lib/server/interview-knowledge";

export const runtime = "nodejs";

const RequestSchema = z.object({
  ast: ResumeASTSchema,
  claims: z.array(ClaimSchema).max(500),
  stories: z.array(InterviewStorySchema).max(100),
  jdText: z.string().trim().min(1).max(60_000).optional(),
});

function resumeQuestion(input: z.infer<typeof RequestSchema>): InterviewQuestion | undefined {
  const story = input.stories[0];
  if (!story) return undefined;
  const english = input.ast.locale === "en-US";
  return InterviewQuestionSchema.parse({
    id: `resume-${story.id}`,
    locale: input.ast.locale === "mixed" ? "zh-CN" : input.ast.locale,
    prompt: english
      ? `Walk me through the experience "${story.title}", focusing on your decisions, individual actions, and verifiable result.`
      : `请围绕「${story.title}」这段经历，说明你的判断、个人行动和可核实结果。`,
    category: "resume",
    difficulty: "intermediate",
    roleFamilies: [],
    skills: story.keywords,
    followUps: english ? ["Which evidence best supports your contribution?"] : ["哪项证据最能支持你的个人贡献？"],
    scoringAnchors: english
      ? ["Consistent with the resume", "Separates individual and team contribution", "Uses verifiable evidence"]
      : ["与最终简历口径一致", "区分个人与团队贡献", "使用可核实证据"],
    source: "derived-from-confirmed-resume-story@1.0.0",
    generated: true,
    referenceQuestionIds: story.claimIds,
  });
}

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, RequestSchema);
    await enforceAiRateLimit(request, "interview");
    const catalog = await loadInterviewQuestionCatalog(input.ast.locale);
    const securityContext = createCapabilityContext(input.ast.locale, ["selected_text"], request.signal);
    const redaction = input.jdText
      ? await invokeBaselineCapability("pii.redact", { text: input.jdText }, securityContext)
      : undefined;
    const guard = redaction
      ? await invokeBaselineCapability("prompt.guard", { text: redaction.data.redactedText }, securityContext)
      : undefined;
    const jobContext = createCapabilityContext(
      input.ast.locale,
      ["job_description"],
      request.signal,
      AI_CAPABILITY_TIMEOUT_MS,
    );
    const job = redaction
      ? await invokeCapability("jd.parse", { text: guard!.data.safeText, locale: input.ast.locale }, jobContext)
      : undefined;
    const storyQuestion = resumeQuestion(input);
    const skills = [
      ...new Set([
        ...input.ast.sections.flatMap((section) => section.entries.flatMap((entry) => entry.keywords)),
        ...input.stories.flatMap((story) => story.keywords),
      ]),
    ].slice(0, 30);
    const planningContext = createCapabilityContext(
      input.ast.locale,
      ["anonymous_metadata"],
      request.signal,
      AI_CAPABILITY_TIMEOUT_MS,
    );
    const retrieved = await invokeBaselineCapability(
      "question.retrieve",
      {
        locale: input.ast.locale,
        role: job?.data.jobPosting.title,
        skills,
        count: storyQuestion ? 5 : 6,
        catalog,
      },
      planningContext,
    );
    const candidates = storyQuestion ? [storyQuestion, ...retrieved.data.questions] : retrieved.data.questions;
    const plan = await invokeCapability(
      "interview.plan",
      { questions: candidates, durationMinutes: 20, questionCount: 6, maxFollowUpsPerQuestion: 2 },
      planningContext,
    );
    const plannedQuestions = plan.data.items.map((item) => item.question);
    const questions = storyQuestion
      ? [
          storyQuestion,
          ...plannedQuestions.filter((question) => question.id !== storyQuestion.id),
        ].slice(0, 6)
      : plannedQuestions;
    return jsonResponse(
      InterviewPlanSchema.parse({
        questions,
        stories: input.stories,
        durationMinutes: plan.data.durationMinutes,
        maxFollowUps: plan.data.maxFollowUpsPerQuestion,
      }),
      {
        headers: {
          "x-capability-trace": [
            redaction?.sourceVersion,
            guard?.sourceVersion,
            job?.sourceVersion,
            plan.sourceVersion,
          ]
            .filter(Boolean)
            .join(","),
        },
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
