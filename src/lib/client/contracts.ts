import { z } from "zod";
import {
  AnswerEvaluationSchema,
  AtsAuditSchema,
  ClaimSchema,
  EvidenceAssetSchema,
  ExportHardGateSchema,
  ExportQualityReportSchema,
  InterviewQuestionSchema,
  InterviewStorySchema,
  JDRequirementSchema,
  JobPostingSchema,
  RequirementEvidenceMapSchema,
  ResumeDocumentSchema,
  ResumeTemplateIdSchema,
  ResumeVariantSchema,
  ScorecardSchema,
  SuggestionSchema,
} from "@/lib/domain";

export const AnalysisBundleSchema = z.object({
  resume: ResumeDocumentSchema,
  evidence: z.array(EvidenceAssetSchema),
  claims: z.array(ClaimSchema),
  scorecard: ScorecardSchema,
  atsAudit: AtsAuditSchema.optional(),
  suggestions: z.array(SuggestionSchema),
  stories: z.array(InterviewStorySchema),
  originalPdfBase64: z.string().min(1).optional(),
  processing: z.object({
    analysisSource: z.enum(["ai", "demo-template"]).optional(),
    extractionMode: z.enum(["native", "hybrid", "ocr"]),
    durationMs: z.number().nonnegative(),
    capabilityVersions: z.record(z.string(), z.string()),
    aiAnalysis: z
      .object({
        status: z.enum(["fresh", "stale", "refreshing", "failed"]),
        analyzedRevision: z.number().int().nonnegative(),
        scoreSourceVersion: z.string().min(1),
        suggestionSourceVersion: z.string().min(1),
      })
      .optional(),
  }),
});
export type AnalysisBundle = z.infer<typeof AnalysisBundleSchema>;

export const ResumeAnalysisRequestSchema = z.object({
  resume: ResumeDocumentSchema,
  claims: z.array(ClaimSchema).max(500),
});

export const ResumeAnalysisResponseSchema = z.object({
  resumeId: z.string().min(1),
  resumeRevision: z.number().int().nonnegative(),
  scorecard: ScorecardSchema,
  suggestions: z.array(SuggestionSchema),
  capabilityVersions: z.object({
    "resume.score": z.string().min(1),
    "resume.suggest": z.string().min(1),
  }),
  durationMs: z.number().nonnegative(),
});
export type ResumeAnalysisResponse = z.infer<
  typeof ResumeAnalysisResponseSchema
>;

export const EvidenceRewriteRequestSchema = z
  .object({
    resumeId: z.string().min(1).max(160),
    resumeRevision: z.number().int().nonnegative(),
    suggestionId: z.string().min(1).max(160),
    locale: z.enum(["zh-CN", "en-US", "zh-TW", "mixed"]),
    originalText: z.string().trim().min(2).max(6_000),
    supplementalFacts: z.string().trim().min(2).max(2_000),
  })
  .strict();
export type EvidenceRewriteRequest = z.infer<
  typeof EvidenceRewriteRequestSchema
>;

export const EvidenceRewriteResponseSchema = z
  .object({
    resumeId: z.string().min(1).max(160),
    resumeRevision: z.number().int().nonnegative(),
    suggestionId: z.string().min(1).max(160),
    rewrittenText: z.string().trim().min(2).max(4_000),
    sourceVersion: z.string().min(1),
    durationMs: z.number().nonnegative(),
  })
  .strict();
export type EvidenceRewriteResponse = z.infer<
  typeof EvidenceRewriteResponseSchema
>;

function enhancedAiSourceVersion(capabilityId: string) {
  const escapedId = capabilityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return z
    .string()
    .regex(
      new RegExp(`^${escapedId}@(2|[3-9]|\\d{2,})\\.`),
      `${capabilityId} must come from the enhanced AI provider.`,
    );
}

export const JobMatchBundleSchema = z
  .object({
    sourceResumeId: z.string().min(1),
    sourceResumeRevision: z.number().int().nonnegative(),
    job: JobPostingSchema,
    requirements: z.array(JDRequirementSchema),
    mappings: z.array(RequirementEvidenceMapSchema),
    coverage: z.number().min(0).max(100),
    summary: z.string(),
    riskFlags: z.array(z.string()),
    capabilityVersions: z
      .object({
        "jd.parse": enhancedAiSourceVersion("jd.parse"),
        "job.match": enhancedAiSourceVersion("job.match"),
      })
      .strict(),
    variant: ResumeVariantSchema.optional(),
    variantUnavailableReason: z.string().min(1).optional(),
  })
  .superRefine((bundle, context) => {
    if (
      bundle.variant &&
      bundle.variant.changes.length === 0 &&
      bundle.variant.appliedSuggestionIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["variant"],
        message: "A job variant must declare at least one applied change.",
      });
    }
    if (bundle.variant && bundle.variantUnavailableReason) {
      context.addIssue({
        code: "custom",
        path: ["variantUnavailableReason"],
        message: "A created variant cannot also be marked unavailable.",
      });
    }
  });
export type JobMatchBundle = z.infer<typeof JobMatchBundleSchema>;

export const InitialAnalysisBundleSchema = AnalysisBundleSchema.extend({
  jobMatch: JobMatchBundleSchema.optional(),
}).superRefine((bundle, context) => {
  if (
    bundle.jobMatch &&
    (bundle.jobMatch.sourceResumeId !== bundle.resume.id ||
      bundle.jobMatch.sourceResumeRevision !== bundle.resume.revision)
  ) {
    context.addIssue({
      code: "custom",
      path: ["jobMatch"],
      message: "The initial job match must target the analyzed resume revision.",
    });
  }
});
export type InitialAnalysisBundle = z.infer<
  typeof InitialAnalysisBundleSchema
>;

export const JobDraftSchema = z
  .object({
    jdText: z.string().max(60_000),
    jobTitle: z.string().max(120),
    seniority: z.enum([
      "",
      "intern",
      "entry",
      "mid",
      "senior",
      "lead",
      "executive",
    ]),
    location: z.string().max(160),
    language: z.enum(["zh-CN", "en-US"]),
  })
  .strict();
export type JobDraft = z.infer<typeof JobDraftSchema>;

export const InterviewPlanSchema = z.object({
  sourceResumeId: z.string().min(1),
  sourceResumeRevision: z.number().int().nonnegative(),
  questions: z.array(InterviewQuestionSchema),
  stories: z.array(InterviewStorySchema),
  durationMinutes: z.number().int().positive(),
  maxFollowUps: z.number().int().nonnegative(),
  capabilityVersions: z
    .object({
      "jd.parse": enhancedAiSourceVersion("jd.parse").optional(),
      "interview.plan": enhancedAiSourceVersion("interview.plan"),
    })
    .strict(),
});
export type InterviewPlan = z.infer<typeof InterviewPlanSchema>;

export function dedupeConsistencyWarnings(
  warnings: readonly string[],
): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const warning of warnings) {
    const normalized = warning.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

export const AnswerCoachingSchema = z.object({
  headline: z.string().min(1),
  actions: z.array(z.string().min(1)),
  improvedOutline: z.array(z.string().min(1)),
  factSafetyReminder: z.string().min(1),
});
export type AnswerCoaching = z.infer<typeof AnswerCoachingSchema>;

export const EvaluationResponseSchema = z.object({
  sourceResumeId: z.string().min(1),
  sourceResumeRevision: z.number().int().nonnegative(),
  evaluation: AnswerEvaluationSchema,
  // Optional so a v3 session created before coaching was exposed can still be restored.
  coaching: AnswerCoachingSchema.optional(),
  consistencyWarnings: z.array(z.string()).transform(dedupeConsistencyWarnings),
  capabilityVersions: z
    .object({
      "answer.evaluate": enhancedAiSourceVersion("answer.evaluate"),
      "answer.coach": enhancedAiSourceVersion("answer.coach"),
    })
    .strict(),
});
export type EvaluationResponse = z.infer<typeof EvaluationResponseSchema>;

export const InterviewSetupStageSchema = z.enum(["intro", "device_check"]);
export type InterviewSetupStage = z.infer<typeof InterviewSetupStageSchema>;

export const InterviewProgressSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceResumeId: z.string().min(1),
    sourceResumeRevision: z.number().int().nonnegative(),
    planFingerprint: z.string().min(1).max(128),
    questionIndex: z.number().int().nonnegative(),
    followUpRound: z.number().int().min(0).max(2),
    askedFollowUps: z.array(z.string().trim().min(1).max(1_000)).max(2),
    followUpEvaluation: EvaluationResponseSchema.nullable(),
    transcript: z.string().max(50_000),
    transcriptSource: z.enum(["speech", "text"]),
  })
  .strict();
export type InterviewProgress = z.infer<typeof InterviewProgressSchema>;

export const TranscriptionResponseSchema = z.object({
  transcript: z.string(),
  locale: z.enum(["zh-CN", "en-US", "zh-TW", "mixed"]),
  isFinal: z.boolean(),
  source: z.literal("browser-speech-recognition"),
  audioProcessed: z.literal(false),
});
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;

export const LayoutRecommendationSchema = z.object({
  recommendedTemplate: ResumeTemplateIdSchema,
  estimatedPages: z.number().int().positive(),
  density: z.enum(["light", "balanced", "dense"]),
  reasons: z.array(z.string().min(1)).min(1),
  rankings: z
    .array(
      z.object({
        template: ResumeTemplateIdSchema,
        score: z.number().min(0).max(100),
        estimatedPages: z.number().int().positive(),
      }),
    )
    .length(3),
});
export type LayoutRecommendation = z.infer<typeof LayoutRecommendationSchema>;

export const RenderResponseSchema = z
  .object({
    template: ResumeTemplateIdSchema,
    pdfBase64: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().positive(),
    searchableText: z.boolean(),
    astContentCovered: z.boolean(),
    hardGate: ExportHardGateSchema,
    report: ExportQualityReportSchema,
    generation: z
      .object({
        attempts: z.union([z.literal(1), z.literal(2)]),
        aiRepairApplied: z.boolean(),
        aiRepairSourceVersion: z.string().min(1).optional(),
      })
      .optional(),
  })
  .superRefine((render, context) => {
    if (
      render.generation &&
      render.generation.aiRepairApplied !==
        Boolean(render.generation.aiRepairSourceVersion)
    ) {
      context.addIssue({
        code: "custom",
        message: "AI repair state must match its source version.",
      });
    }
    if (render.sha256 !== render.report.artifactSha256) {
      context.addIssue({
        code: "custom",
        message: "Render hash must match the quality report.",
      });
    }
    if (render.searchableText !== render.report.searchableText) {
      context.addIssue({
        code: "custom",
        message: "Render searchability must match the quality report.",
      });
    }
    if (render.astContentCovered !== render.report.contentComplete) {
      context.addIssue({
        code: "custom",
        message: "Render content coverage must match the quality report.",
      });
    }
    if (
      render.hardGate.passed !== render.report.hardGate.passed ||
      render.hardGate.blockingCheckIds.join("|") !==
        render.report.hardGate.blockingCheckIds.join("|")
    ) {
      context.addIssue({
        code: "custom",
        message: "Render hard gate must match the quality report.",
      });
    }
  });
export type RenderResponse = z.infer<typeof RenderResponseSchema>;

export type CapabilityAvailability = {
  id: string;
  available: boolean;
  version: string;
  source: string;
  degraded?: boolean;
};
