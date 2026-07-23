import { z } from "zod";
import {
  AnswerEvaluationSchema,
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
  ResumeVariantSchema,
  ScorecardSchema,
  SuggestionSchema,
} from "@/lib/domain";

export const AnalysisBundleSchema = z.object({
  resume: ResumeDocumentSchema,
  evidence: z.array(EvidenceAssetSchema),
  claims: z.array(ClaimSchema),
  scorecard: ScorecardSchema,
  suggestions: z.array(SuggestionSchema),
  stories: z.array(InterviewStorySchema),
  pagePreviews: z.array(z.string()),
  originalPdfBase64: z.string().min(1).optional(),
  processing: z.object({
    extractionMode: z.enum(["native", "hybrid", "ocr"]),
    durationMs: z.number().nonnegative(),
    capabilityVersions: z.record(z.string(), z.string()),
  }),
});
export type AnalysisBundle = z.infer<typeof AnalysisBundleSchema>;

export const JobMatchBundleSchema = z.object({
  sourceResumeId: z.string().min(1),
  sourceResumeRevision: z.number().int().nonnegative(),
  job: JobPostingSchema,
  requirements: z.array(JDRequirementSchema),
  mappings: z.array(RequirementEvidenceMapSchema),
  coverage: z.number().min(0).max(100),
  summary: z.string(),
  riskFlags: z.array(z.string()),
  variant: ResumeVariantSchema.optional(),
});
export type JobMatchBundle = z.infer<typeof JobMatchBundleSchema>;

export const InterviewPlanSchema = z.object({
  sourceResumeId: z.string().min(1).optional(),
  sourceResumeRevision: z.number().int().nonnegative().optional(),
  questions: z.array(InterviewQuestionSchema),
  stories: z.array(InterviewStorySchema),
  durationMinutes: z.number().int().positive(),
  maxFollowUps: z.number().int().nonnegative(),
});
export type InterviewPlan = z.infer<typeof InterviewPlanSchema>;

export function dedupeConsistencyWarnings(warnings: readonly string[]): string[] {
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

export const EvaluationResponseSchema = z.object({
  sourceResumeId: z.string().min(1).optional(),
  sourceResumeRevision: z.number().int().nonnegative().optional(),
  evaluation: AnswerEvaluationSchema,
  consistencyWarnings: z.array(z.string()).transform(dedupeConsistencyWarnings),
});
export type EvaluationResponse = z.infer<typeof EvaluationResponseSchema>;

export const TranscriptionResponseSchema = z.object({
  transcript: z.string(),
  locale: z.enum(["zh-CN", "en-US", "zh-TW", "mixed"]),
  isFinal: z.boolean(),
  source: z.literal("browser-speech-recognition"),
  audioProcessed: z.literal(false),
});
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;

export const LayoutRecommendationSchema = z.object({
  recommendedTemplate: z.enum(["professional", "minimal", "compact"]),
  estimatedPages: z.number().int().positive(),
  density: z.enum(["light", "balanced", "dense"]),
  reasons: z.array(z.string().min(1)).min(1),
  rankings: z.array(
    z.object({
      template: z.enum(["professional", "minimal", "compact"]),
      score: z.number().min(0).max(100),
      estimatedPages: z.number().int().positive(),
    }),
  ).length(3),
});
export type LayoutRecommendation = z.infer<typeof LayoutRecommendationSchema>;

export const RenderResponseSchema = z.object({
  template: z.enum(["professional", "minimal", "compact"]),
  pdfBase64: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().positive(),
  searchableText: z.boolean(),
  astContentCovered: z.boolean(),
  hardGate: ExportHardGateSchema,
  report: ExportQualityReportSchema,
}).superRefine((render, context) => {
  if (render.sha256 !== render.report.artifactSha256) {
    context.addIssue({ code: "custom", message: "Render hash must match the quality report." });
  }
  if (render.searchableText !== render.report.searchableText) {
    context.addIssue({ code: "custom", message: "Render searchability must match the quality report." });
  }
  if (render.astContentCovered !== render.report.contentComplete) {
    context.addIssue({ code: "custom", message: "Render content coverage must match the quality report." });
  }
  if (
    render.hardGate.passed !== render.report.hardGate.passed ||
    render.hardGate.blockingCheckIds.join("|") !== render.report.hardGate.blockingCheckIds.join("|")
  ) {
    context.addIssue({ code: "custom", message: "Render hard gate must match the quality report." });
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
