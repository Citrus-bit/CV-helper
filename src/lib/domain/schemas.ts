import { z } from "zod";

export const LocaleSchema = z.enum(["zh-CN", "en-US", "zh-TW", "mixed"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const BoundingBoxSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const SourceBlockSchema = z.object({
  id: z.string().min(1),
  pageIndex: z.number().int().nonnegative(),
  order: z.number().int().nonnegative(),
  text: z.string(),
  bbox: BoundingBoxSchema,
  source: z.enum(["native", "ocr", "user"]),
  confidence: z.number().min(0).max(1),
  role: z
    .enum(["heading", "paragraph", "list-item", "table", "contact", "footer", "unknown"])
    .default("unknown"),
  style: z
    .object({
      fontFamily: z.string().trim().min(1).max(256).optional(),
      fontSize: z.number().positive().max(1_000).optional(),
      fontWeight: z.number().int().min(100).max(900).optional(),
      fontStyle: z.enum(["normal", "italic"]).optional(),
      color: z.string().optional(),
    })
    .optional(),
});
export type SourceBlock = z.infer<typeof SourceBlockSchema>;

export const ResumeContactSchema = z.object({
  name: z.string().default(""),
  headline: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
});
export type ResumeContact = z.infer<typeof ResumeContactSchema>;

export const ResumeEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().default(""),
  subtitle: z.string().optional(),
  organization: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  current: z.boolean().default(false),
  summary: z.string().optional(),
  bullets: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  sourceBlockIds: z.array(z.string()).default([]),
});
export type ResumeEntry = z.infer<typeof ResumeEntrySchema>;

export const ResumeSectionTypeSchema = z.enum([
  "summary",
  "experience",
  "education",
  "projects",
  "skills",
  "certifications",
  "awards",
  "publications",
  "languages",
  "custom",
]);
export type ResumeSectionType = z.infer<typeof ResumeSectionTypeSchema>;

export const ResumeSectionSchema = z.object({
  id: z.string().min(1),
  type: ResumeSectionTypeSchema,
  title: z.string().min(1),
  entries: z.array(ResumeEntrySchema).default([]),
  text: z.string().optional(),
  sourceBlockIds: z.array(z.string()).default([]),
});
export type ResumeSection = z.infer<typeof ResumeSectionSchema>;

export const ResumeASTSchema = z.object({
  schemaVersion: z.literal("1.0"),
  locale: LocaleSchema,
  contact: ResumeContactSchema,
  summary: z.string().optional(),
  sections: z.array(ResumeSectionSchema),
});
export type ResumeAST = z.infer<typeof ResumeASTSchema>;

export const ResumeDocumentSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  originalFileName: z.string().min(1),
  mimeType: z.literal("application/pdf"),
  locale: LocaleSchema,
  pageCount: z.number().int().positive(),
  parseMethod: z.enum(["native", "ocr", "mixed"]),
  sourceBlocks: z.array(SourceBlockSchema),
  ast: ResumeASTSchema,
  parsingWarnings: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});
export type ResumeDocument = z.infer<typeof ResumeDocumentSchema>;

export const EvidenceAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["resume_text", "user_statement", "document", "link", "metric", "other"]),
  label: z.string().min(1),
  content: z.string().min(1),
  sourceBlockIds: z.array(z.string()).default([]),
  uri: z.string().optional(),
  verifiedByUser: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type EvidenceAsset = z.infer<typeof EvidenceAssetSchema>;

export const ClaimSupportStatusSchema = z.enum([
  "resume_only",
  "user_confirmed",
  "supported",
  "needs_evidence",
  "conflicting",
]);
export type ClaimSupportStatus = z.infer<typeof ClaimSupportStatusSchema>;

export const ClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  subject: z.string().optional(),
  action: z.string().optional(),
  method: z.string().optional(),
  result: z.string().optional(),
  sourceBlockIds: z.array(z.string()).default([]),
  evidenceAssetIds: z.array(z.string()).default([]),
  status: ClaimSupportStatusSchema,
  confidence: z.number().min(0).max(1),
  missingInformation: z.array(z.string()).default([]),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const SuggestionKindSchema = z.enum([
  "use_as_is",
  "rewrite",
  "needs_proof",
  "remove",
  "ask_user",
]);
export type SuggestionKind = z.infer<typeof SuggestionKindSchema>;

export const SuggestionStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "manual",
  "stale",
]);
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;

export const SuggestionPatchSchema = z.object({
  operation: z.enum(["add", "replace", "remove"]),
  path: z.string().startsWith("/"),
  value: z.unknown().optional(),
});
export type SuggestionPatch = z.infer<typeof SuggestionPatchSchema>;

export const SuggestionSchema = z.object({
  id: z.string().min(1),
  resumeRevision: z.number().int().nonnegative(),
  sourceBlockIds: z.array(z.string()).default([]),
  claimIds: z.array(z.string()).default([]),
  kind: SuggestionKindSchema,
  status: SuggestionStatusSchema.default("pending"),
  originalText: z.string(),
  proposedText: z.string().optional(),
  rationale: z.string().min(1),
  question: z.string().optional(),
  beforeHash: z.string().min(1),
  patches: z.array(SuggestionPatchSchema).default([]),
  affectedDimensions: z.array(z.string()).default([]),
  factRisk: z.enum(["none", "low", "medium", "high"]),
  interviewRisk: z.enum(["none", "low", "medium", "high"]).default("none"),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const ScoreDimensionIdSchema = z.enum([
  "impact",
  "completeness",
  "clarity",
  "structure",
  "ats",
  "language",
]);
export type ScoreDimensionId = z.infer<typeof ScoreDimensionIdSchema>;

export const ScoreDimensionSchema = z.object({
  id: ScoreDimensionIdSchema,
  label: z.string().min(1),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  evidence: z.array(z.string()).default([]),
  deductions: z.array(z.string()).default([]),
});
export type ScoreDimension = z.infer<typeof ScoreDimensionSchema>;

export const ScorecardSchema = z.object({
  resumeId: z.string().min(1),
  resumeRevision: z.number().int().nonnegative(),
  total: z.number().min(0).max(100),
  dimensions: z.array(ScoreDimensionSchema).length(6),
  summary: z.string(),
  sourceVersion: z.string().min(1).optional(),
});
export type Scorecard = z.infer<typeof ScorecardSchema>;

export const AtsFindingSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
  sourceBlockIds: z.array(z.string().min(1)).default([]),
});
export type AtsFinding = z.infer<typeof AtsFindingSchema>;

export const AtsAuditSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  findings: z.array(AtsFindingSchema),
  sourceVersion: z.string().min(1),
});
export type AtsAudit = z.infer<typeof AtsAuditSchema>;

export const JobPostingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  company: z.string().optional(),
  location: z.string().optional(),
  locale: LocaleSchema,
  rawText: z.string().min(1),
  employmentType: z.string().optional(),
  seniority: z.string().optional(),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

export const JDRequirementSchema = z.object({
  id: z.string().min(1),
  jobPostingId: z.string().min(1),
  category: z.enum(["must_have", "responsibility", "skill", "nice_to_have", "constraint"]),
  text: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  importance: z.number().min(0).max(1),
});
export type JDRequirement = z.infer<typeof JDRequirementSchema>;

export const RequirementEvidenceMapSchema = z.object({
  requirementId: z.string().min(1),
  status: z.enum(["met", "partial", "gap", "conflict"]),
  claimIds: z.array(z.string()).default([]),
  evidenceAssetIds: z.array(z.string()).default([]),
  explanation: z.string().min(1),
  confidence: z.number().min(0).max(1),
  suggestedAction: z.string().optional(),
});
export type RequirementEvidenceMap = z.infer<typeof RequirementEvidenceMapSchema>;

const ResumeVariantReorderChangeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["section_reorder", "entry_reorder", "bullet_reorder"]),
  path: z.string().startsWith("/sections"),
  beforeIds: z.array(z.string().min(1)).min(2),
  afterIds: z.array(z.string().min(1)).min(2),
  requirementIds: z.array(z.string().min(1)).default([]),
  claimIds: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1),
});

const ResumeVariantHeadlineChangeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("headline_update"),
  path: z.literal("/contact/headline"),
  beforeText: z.string(),
  afterText: z.string().trim().min(1),
  requirementIds: z.array(z.string().min(1)).default([]),
  claimIds: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1),
});

export const ResumeVariantChangeSchema = z
  .discriminatedUnion("kind", [
    ResumeVariantReorderChangeSchema,
    ResumeVariantHeadlineChangeSchema,
  ])
  .superRefine((change, context) => {
    if (change.kind === "headline_update") {
      if (change.beforeText.trim() === change.afterText.trim()) {
        context.addIssue({
          code: "custom",
          message: "Variant headline change must update the target role.",
        });
      }
      return;
    }
    if (change.beforeIds.length !== change.afterIds.length) {
      context.addIssue({
        code: "custom",
        message: "Variant reorder must preserve the number of items.",
      });
    }
    if (
      [...change.beforeIds].sort().join("\u0000") !==
      [...change.afterIds].sort().join("\u0000")
    ) {
      context.addIssue({
        code: "custom",
        message: "Variant reorder must preserve every original item.",
      });
    }
    if (change.beforeIds.join("\u0000") === change.afterIds.join("\u0000")) {
      context.addIssue({
        code: "custom",
        message: "Variant change must describe an actual order difference.",
      });
    }
  });
export type ResumeVariantChange = z.infer<typeof ResumeVariantChangeSchema>;

export const ResumeVariantSchema = z.object({
  id: z.string().min(1),
  baseResumeId: z.string().min(1),
  baseRevision: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  jobPostingId: z.string().optional(),
  name: z.string().min(1),
  ast: ResumeASTSchema,
  appliedSuggestionIds: z.array(z.string()).default([]),
  changes: z.array(ResumeVariantChangeSchema).default([]),
});
export type ResumeVariant = z.infer<typeof ResumeVariantSchema>;

export const InterviewStorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string(),
  claimIds: z.array(z.string()).default([]),
  evidenceAssetIds: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  riskNotes: z.array(z.string()).default([]),
});
export type InterviewStory = z.infer<typeof InterviewStorySchema>;

export const InterviewQuestionSchema = z.object({
  id: z.string().min(1),
  locale: LocaleSchema,
  prompt: z.string().min(1),
  category: z.enum(["behavioral", "technical", "role", "resume", "case", "motivation"]),
  difficulty: z.enum(["introductory", "intermediate", "advanced"]),
  roleFamilies: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
  scoringAnchors: z.array(z.string()).default([]),
  source: z.string().min(1),
  generated: z.boolean().default(false),
  referenceQuestionIds: z.array(z.string()).default([]),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;

export const AnswerEvaluationSchema = z.object({
  questionId: z.string().min(1),
  overallScore: z.number().min(0).max(100),
  dimensions: z.object({
    relevance: z.number().min(0).max(20),
    structure: z.number().min(0).max(20),
    evidence: z.number().min(0).max(20),
    roleCompetency: z.number().min(0).max(20),
    clarity: z.number().min(0).max(20),
  }),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  citedAnswerFragments: z.array(z.string()).default([]),
  followUpQuestion: z.string().optional(),
});
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

export const ResumeTemplateIdSchema = z.enum([
  "professional",
  "minimal",
  "compact",
]);
export type ResumeTemplateId = z.infer<typeof ResumeTemplateIdSchema>;

export const AuditCheckSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["pass", "warn", "fail"]),
  details: z.string().optional(),
});
export type AuditCheck = z.infer<typeof AuditCheckSchema>;

export const ExportHardGateSchema = z.object({
  passed: z.boolean(),
  blockingCheckIds: z.array(z.string().min(1)),
});
export type ExportHardGate = z.infer<typeof ExportHardGateSchema>;

export const ExportQualityReportSchema = z.object({
  resumeId: z.string().min(1),
  resumeRevision: z.number().int().nonnegative(),
  template: ResumeTemplateIdSchema,
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePageCount: z.number().int().positive().optional(),
  pageCount: z.number().int().nonnegative(),
  downloadable: z.boolean(),
  searchableText: z.boolean(),
  contentComplete: z.boolean(),
  hardGate: ExportHardGateSchema,
  overallScore: z.number().min(0).max(100),
  checks: z.array(AuditCheckSchema),
  generatedAt: z.string().datetime(),
}).superRefine((report, context) => {
  if (report.downloadable !== report.hardGate.passed) {
    context.addIssue({ code: "custom", message: "Downloadable state must match the export hard gate." });
  }
  if (report.hardGate.passed && report.hardGate.blockingCheckIds.length > 0) {
    context.addIssue({ code: "custom", message: "A passing hard gate cannot contain blocking checks." });
  }
  if (!report.hardGate.passed && report.hardGate.blockingCheckIds.length === 0) {
    context.addIssue({ code: "custom", message: "A failed hard gate must identify a blocking check." });
  }
});
export type ExportQualityReport = z.infer<typeof ExportQualityReportSchema>;
