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
import { invokeRequiredAiCapability } from "@/lib/server/capability-runtime";
import { jsonResponse, parseJsonBody, routeErrorResponse } from "@/lib/server/http";
import { loadInterviewQuestionCatalog } from "@/lib/server/interview-knowledge";

export const runtime = "nodejs";

const RequestSchema = z.object({
  resumeId: z.string().min(1).max(160),
  revision: z.number().int().nonnegative(),
  ast: ResumeASTSchema,
  claims: z.array(ClaimSchema).max(500),
  stories: z.array(InterviewStorySchema).max(100),
  jdText: z.string().trim().min(1).max(60_000).optional(),
});

function compactContext(value: string, maxLength = 600) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function resumeQuestionReferences(input: z.infer<typeof RequestSchema>): InterviewQuestion[] {
  return input.stories.slice(0, 3).map((story) => {
    const details = [
      ["Situation", "情境", story.situation],
      ["Task", "任务", story.task],
      ["Action", "行动", story.action],
      ["Result", "结果", story.result],
    ]
      .filter(([, , value]) => value.trim().length > 0)
      .map(([englishLabel, chineseLabel, value]) => ({
        english: `${englishLabel}: ${compactContext(value)}`,
        chinese: `${chineseLabel}：${compactContext(value)}`,
      }));
    const chinesePrompt = [
      `简历故事参考「${compactContext(story.title, 200)}」`,
      ...details.map((detail) => detail.chinese),
    ].join("；");
    const englishPrompt = [
      `Resume story reference "${compactContext(story.title, 200)}"`,
      ...details.map((detail) => detail.english),
    ].join("; ");
    const prompt = input.ast.locale === "en-US"
      ? englishPrompt
      : input.ast.locale === "mixed"
        ? `${chinesePrompt}\n${englishPrompt}`
        : chinesePrompt;
    return InterviewQuestionSchema.parse({
      id: `resume-story-${story.id}`,
      locale: input.ast.locale,
      prompt,
      category: "resume",
      difficulty: "intermediate",
      roleFamilies: [],
      skills: story.keywords.slice(0, 12),
      followUps: [],
      scoringAnchors: input.ast.locale === "en-US"
        ? ["Consistent with the resume", "Separates individual and team contribution", "Uses verifiable evidence"]
        : ["与最终简历口径一致", "区分个人与团队贡献", "使用可核实证据"],
      source: "resume-story-context@1.0.0",
      generated: false,
      referenceQuestionIds: [],
    });
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
      ? await invokeRequiredAiCapability("jd.parse", { text: guard!.data.safeText, locale: input.ast.locale }, jobContext)
      : undefined;
    const storyReferences = resumeQuestionReferences(input);
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
        count: 6,
        catalog,
      },
      planningContext,
    );
    // The model selects and adapts only from traceable resume stories and the
    // curated catalog. Keeping references in the request preserves provenance
    // for generated questions without treating catalog text as instructions.
    const references = [...storyReferences, ...retrieved.data.questions];
    const plan = await invokeRequiredAiCapability(
      "interview.plan",
      {
        locale: input.ast.locale,
        role: job?.data.jobPosting.title,
        skills,
        jobRequirements: job?.data.requirements.map((requirement) => requirement.text) ?? [],
        questions: references,
        durationMinutes: 20,
        questionCount: 6,
        maxFollowUpsPerQuestion: 2,
      },
      planningContext,
    );
    const questions = plan.data.items.map((item) => item.question);
    return jsonResponse(
      InterviewPlanSchema.parse({
        sourceResumeId: input.resumeId,
        sourceResumeRevision: input.revision,
        questions,
        stories: input.stories,
        durationMinutes: plan.data.durationMinutes,
        maxFollowUps: plan.data.maxFollowUpsPerQuestion,
        capabilityVersions: {
          ...(job ? { "jd.parse": job.sourceVersion } : {}),
          "interview.plan": plan.sourceVersion,
        },
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
