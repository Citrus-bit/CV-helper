import { z } from "zod";

import {
  AnswerEvaluationSchema,
  AtsAuditSchema,
  ClaimSchema,
  EvidenceAssetSchema,
  ExportQualityReportSchema,
  InterviewQuestionSchema,
  InterviewStorySchema,
  JDRequirementSchema,
  JobPostingSchema,
  LocaleSchema,
  RequirementEvidenceMapSchema,
  ResumeASTSchema,
  ResumeDocumentSchema,
  ScorecardSchema,
  SourceBlockSchema,
  SuggestionSchema,
} from "@/lib/domain";

export const Base64DataSchema = z.base64().min(4);

export const DocumentParseInputSchema = z.object({
  pdfBase64: Base64DataSchema,
  fileName: z.string().min(1).default("resume.pdf"),
});
export const DocumentParseOutputSchema = z.object({
  fileName: z.string().min(1),
  pageCount: z.number().int().positive(),
  text: z.string(),
  blocks: z.array(SourceBlockSchema),
  pages: z.array(
    z.object({
      pageIndex: z.number().int().nonnegative(),
      width: z.number().positive(),
      height: z.number().positive(),
      previewWidth: z.number().int().positive().optional(),
      previewHeight: z.number().int().positive().optional(),
      source: z.enum(["digital", "scan", "mixed"]),
      nativeCharacterCount: z.number().int().nonnegative(),
      previewMimeType: z.literal("image/png"),
      previewBase64: Base64DataSchema,
    }),
  ),
  warnings: z.array(z.string()),
  extractionMode: z.enum(["native", "mixed", "ocr"]),
});

export const DocumentOcrInputSchema = z.object({
  imageBase64: Base64DataSchema,
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().positive(),
  height: z.number().positive(),
  pageIndex: z.number().int().nonnegative().default(0),
  language: z.enum(["chi_sim+eng", "chi_sim", "eng"]).default("chi_sim+eng"),
});
export const DocumentOcrOutputSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  blocks: z.array(SourceBlockSchema),
  engine: z.literal("tesseract.js"),
});

export const DocumentSegmentInputSchema = z.object({ blocks: z.array(SourceBlockSchema) });
export const DocumentSegmentOutputSchema = z.object({
  blocks: z.array(SourceBlockSchema),
  segments: z.array(
    z.object({
      id: z.string().min(1),
      pageIndex: z.number().int().nonnegative(),
      kind: z.enum(["contact", "section", "body", "footer"]),
      heading: z.string().optional(),
      blockIds: z.array(z.string().min(1)).min(1),
      text: z.string(),
    }),
  ),
});

export const ResumeTemplateSchema = z.enum(["professional", "minimal", "compact"]);
export const LayoutRecommendInputSchema = z.object({
  ast: ResumeASTSchema,
  targetPages: z.number().int().min(1).max(2).default(1),
  preferredTemplate: ResumeTemplateSchema.optional(),
});
export const LayoutRecommendOutputSchema = z.object({
  recommendedTemplate: ResumeTemplateSchema,
  estimatedPages: z.number().int().positive(),
  density: z.enum(["light", "balanced", "dense"]),
  reasons: z.array(z.string().min(1)).min(1),
  rankings: z.array(
    z.object({
      template: ResumeTemplateSchema,
      score: z.number().min(0).max(100),
      estimatedPages: z.number().int().positive(),
    }),
  ).length(3),
});

export const ResumeRenderInputSchema = z.object({
  resumeId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  ast: ResumeASTSchema,
  template: ResumeTemplateSchema,
});
export const ResumeRenderOutputSchema = z.object({
  mimeType: z.literal("application/pdf"),
  pdfBase64: Base64DataSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  template: ResumeTemplateSchema,
});

export const BaselineExportQualityReportSchema = ExportQualityReportSchema;
export const ExportAuditInputSchema = z.object({
  resumeId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  ast: ResumeASTSchema,
  template: ResumeTemplateSchema,
  pdfBase64: Base64DataSchema,
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sourcePageCount: z.number().int().positive().optional(),
});
export const ExportAuditOutputSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  report: BaselineExportQualityReportSchema,
  searchableText: z.boolean(),
  astContentCovered: z.boolean(),
  hardGate: z.object({
    passed: z.boolean(),
    blockingCheckIds: z.array(z.string()),
  }),
}).superRefine((output, context) => {
  if (output.sha256 !== output.report.artifactSha256) {
    context.addIssue({ code: "custom", message: "Audit hash must match the report artifact hash." });
  }
  if (output.searchableText !== output.report.searchableText) {
    context.addIssue({ code: "custom", message: "Searchability must match the report." });
  }
  if (output.astContentCovered !== output.report.contentComplete) {
    context.addIssue({ code: "custom", message: "Content coverage must match the report." });
  }
  if (
    output.hardGate.passed !== output.report.hardGate.passed ||
    output.hardGate.blockingCheckIds.join("|") !== output.report.hardGate.blockingCheckIds.join("|")
  ) {
    context.addIssue({ code: "custom", message: "Hard gate must match the report." });
  }
});

export const SpeechTranscribeInputSchema = z.object({
  browserTranscript: z.string(),
  locale: LocaleSchema,
  browserConfidence: z.number().min(0).max(1).optional(),
  isFinal: z.boolean().default(true),
});
export const SpeechTranscribeOutputSchema = z.object({
  transcript: z.string(),
  locale: LocaleSchema,
  isFinal: z.boolean(),
  source: z.literal("browser-speech-recognition"),
  audioProcessed: z.literal(false),
});

export const AccessibilityAuditInputSchema = z.object({
  fixtureId: z.string().min(1),
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      role: z.string().min(1),
      text: z.string().optional(),
      accessibleName: z.string().optional(),
      visible: z.boolean().default(true),
      interactive: z.boolean().default(false),
      focusable: z.boolean().default(false),
      hasVisibleFocus: z.boolean().optional(),
      contrastRatio: z.number().nonnegative().optional(),
      largeText: z.boolean().default(false),
      targetWidth: z.number().nonnegative().optional(),
      targetHeight: z.number().nonnegative().optional(),
      headingLevel: z.number().int().min(1).max(6).optional(),
    }),
  ),
});
export const AccessibilityAuditOutputSchema = z.object({
  fixtureId: z.string().min(1),
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  findings: z.array(
    z.object({
      nodeId: z.string().min(1),
      ruleId: z.string().min(1),
      severity: z.enum(["warning", "error"]),
      message: z.string().min(1),
    }),
  ),
});

export const SecurityAuditAudioHandlingSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("not_collected"),
  }),
  z.object({
    mode: z.literal("transient"),
    deletedAfterTranscription: z.boolean(),
  }),
]);

export const SecurityAuditInputSchema = z.object({
  fixtureId: z.string().min(1),
  documentWorker: z.object({
    networkPolicy: z.enum(["none", "allowlist", "unrestricted"]),
    runsAsRoot: z.boolean(),
    readOnlyFilesystem: z.boolean(),
    resourceLimits: z.boolean(),
  }),
  privacy: z.object({
    retentionHours: z.number().nonnegative(),
    logsRawContent: z.boolean(),
    audio: SecurityAuditAudioHandlingSchema,
    piiRedactedBeforeExternalProcessing: z.boolean(),
  }),
  skillRuntime: z.object({
    staticAllowlist: z.boolean(),
    secretsExposed: z.boolean(),
    untrustedInputCanGrantPermissions: z.boolean(),
  }),
});
export const SecurityAuditOutputSchema = z.object({
  fixtureId: z.string().min(1),
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  findings: z.array(
    z.object({
      controlId: z.string().min(1),
      severity: z.enum(["warning", "error"]),
      message: z.string().min(1),
    }),
  ),
});

export const LlmEvalAssertionSchema = z.object({
  path: z.string().startsWith("/"),
  operator: z.enum(["equals", "contains", "not_contains", "exists", "gte", "lte"]),
  expected: z.json().optional(),
});
export const LlmEvalInputSchema = z.object({
  suiteId: z.string().min(1),
  fixtures: z.array(
    z.object({
      id: z.string().min(1),
      actual: z.json(),
      assertions: z.array(LlmEvalAssertionSchema).min(1),
    }),
  ).min(1),
});
export const LlmEvalOutputSchema = z.object({
  suiteId: z.string().min(1),
  passed: z.boolean(),
  totalFixtures: z.number().int().positive(),
  passedFixtures: z.number().int().nonnegative(),
  totalAssertions: z.number().int().positive(),
  passedAssertions: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(100),
  fixtureResults: z.array(
    z.object({
      fixtureId: z.string().min(1),
      passed: z.boolean(),
      assertions: z.array(
        z.object({
          path: z.string(),
          operator: LlmEvalAssertionSchema.shape.operator,
          passed: z.boolean(),
          message: z.string(),
        }),
      ),
    }),
  ),
});

export const EvidenceMineInputSchema = z.object({ resume: ResumeDocumentSchema });
export const EvidenceMineOutputSchema = z.object({
  evidenceAssets: z.array(EvidenceAssetSchema),
  claims: z.array(ClaimSchema),
});

export const ClaimAssessInputSchema = z.object({
  claim: ClaimSchema,
  evidenceAssets: z.array(EvidenceAssetSchema).default([]),
});
export const ClaimAssessOutputSchema = ClaimSchema;

export const ClaimConflictInputSchema = z.object({ claims: z.array(ClaimSchema) });
export const ClaimConflictOutputSchema = z.object({
  conflicts: z.array(
    z.object({
      claimIds: z.tuple([z.string(), z.string()]),
      reason: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export const ResumeScoreInputSchema = z.object({
  resume: ResumeDocumentSchema,
  claims: z.array(ClaimSchema).default([]),
});
export const ResumeScoreOutputSchema = ScorecardSchema;

export const ResumeSuggestInputSchema = z.object({
  resume: ResumeDocumentSchema,
  claims: z.array(ClaimSchema).default([]),
});
export const ResumeSuggestOutputSchema = z.object({ suggestions: z.array(SuggestionSchema) });

export const ResumeAtsAuditInputSchema = z.object({ resume: ResumeDocumentSchema });
export const ResumeAtsAuditOutputSchema = AtsAuditSchema.omit({
  sourceVersion: true,
});

export const JdParseInputSchema = z.object({
  text: z.string().min(1),
  locale: LocaleSchema.default("zh-CN"),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
});
export const JdParseOutputSchema = z.object({
  jobPosting: JobPostingSchema,
  requirements: z.array(JDRequirementSchema),
});

export const JobMatchInputSchema = z.object({
  requirements: z.array(JDRequirementSchema),
  claims: z.array(ClaimSchema),
  evidenceAssets: z.array(EvidenceAssetSchema).default([]),
});
export const JobMatchOutputSchema = z.object({
  evidenceCoverageRate: z.number().min(0).max(100),
  maps: z.array(RequirementEvidenceMapSchema),
  disclaimer: z.string(),
});

export const JobRiskDetectInputSchema = z.object({ jobPosting: JobPostingSchema });
export const JobRiskDetectOutputSchema = z.object({
  risks: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      excerpt: z.string(),
      explanation: z.string(),
    }),
  ),
});

export const CopyRewriteInputSchema = z.object({
  text: z.string(),
  preserveTerms: z.array(z.string()).default([]),
});
export const CopyRewriteOutputSchema = z.object({
  original: z.string(),
  rewritten: z.string(),
  changes: z.array(z.string()),
  addedFacts: z.literal(false),
});

export const CopyConsistencyInputSchema = z.object({
  texts: z.array(z.string()),
  locale: LocaleSchema,
});
export const CopyConsistencyOutputSchema = z.object({
  consistent: z.boolean(),
  issues: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      code: z.string(),
      message: z.string(),
      suggestedText: z.string().optional(),
    }),
  ),
});

export const QuestionRetrieveInputSchema = z.object({
  locale: LocaleSchema,
  role: z.string().optional(),
  skills: z.array(z.string()).default([]),
  count: z.number().int().min(1).max(20).default(6),
  catalog: z.array(InterviewQuestionSchema).default([]),
});
export const QuestionRetrieveOutputSchema = z.object({ questions: z.array(InterviewQuestionSchema) });

export const InterviewPlanInputSchema = z.object({
  questions: z.array(InterviewQuestionSchema),
  durationMinutes: z.number().int().min(5).max(90).default(20),
  questionCount: z.number().int().min(1).max(20).default(6),
  maxFollowUpsPerQuestion: z.number().int().min(0).max(2).default(2),
});
export const InterviewPlanOutputSchema = z.object({
  durationMinutes: z.number().int().positive(),
  maxFollowUpsPerQuestion: z.number().int().min(0).max(2),
  items: z.array(
    z.object({
      order: z.number().int().positive(),
      question: InterviewQuestionSchema,
      targetMinutes: z.number().positive(),
    }),
  ),
});

export const StoryBuildInputSchema = z.object({
  claim: ClaimSchema,
  evidenceAssets: z.array(EvidenceAssetSchema).default([]),
  title: z.string().optional(),
});
export const StoryBuildOutputSchema = InterviewStorySchema;

export const AnswerEvaluateInputSchema = z.object({
  question: InterviewQuestionSchema,
  answer: z.string(),
  expectedKeywords: z.array(z.string()).default([]),
});
export const AnswerEvaluateOutputSchema = AnswerEvaluationSchema;

export const AnswerCoachInputSchema = z.object({
  question: InterviewQuestionSchema,
  answer: z.string(),
  evaluation: AnswerEvaluationSchema,
});
export const AnswerCoachOutputSchema = z.object({
  headline: z.string(),
  actions: z.array(z.string()),
  improvedOutline: z.array(z.string()),
  factSafetyReminder: z.string(),
});

export const ResumeInterviewCheckInputSchema = z.object({
  answer: z.string(),
  claims: z.array(ClaimSchema),
});
export const ResumeInterviewCheckOutputSchema = z.object({
  consistent: z.boolean(),
  findings: z.array(
    z.object({
      claimId: z.string().optional(),
      severity: z.enum(["info", "warning"]),
      answerExcerpt: z.string(),
      resumeExcerpt: z.string().optional(),
      explanation: z.string(),
    }),
  ),
});

export const PiiRedactInputSchema = z.object({ text: z.string() });
export const PiiRedactOutputSchema = z.object({
  redactedText: z.string(),
  detections: z.array(
    z.object({
      type: z.enum(["email", "phone", "id_number", "address", "url"]),
      placeholder: z.string(),
    }),
  ),
});

export const PromptGuardInputSchema = z.object({ text: z.string() });
export const PromptGuardOutputSchema = z.object({
  safeText: z.string(),
  suspicious: z.boolean(),
  findings: z.array(
    z.object({
      code: z.string(),
      excerpt: z.string(),
      action: z.literal("treat_as_untrusted_data"),
    }),
  ),
});

export type EvidenceMineInput = z.infer<typeof EvidenceMineInputSchema>;
export type EvidenceMineOutput = z.infer<typeof EvidenceMineOutputSchema>;
export type ClaimAssessInput = z.infer<typeof ClaimAssessInputSchema>;
export type ClaimConflictInput = z.infer<typeof ClaimConflictInputSchema>;
export type ResumeScoreInput = z.infer<typeof ResumeScoreInputSchema>;
export type ResumeSuggestInput = z.infer<typeof ResumeSuggestInputSchema>;
export type ResumeAtsAuditInput = z.infer<typeof ResumeAtsAuditInputSchema>;
export type JdParseInput = z.infer<typeof JdParseInputSchema>;
export type JobMatchInput = z.infer<typeof JobMatchInputSchema>;
export type JobRiskDetectInput = z.infer<typeof JobRiskDetectInputSchema>;
export type CopyRewriteInput = z.infer<typeof CopyRewriteInputSchema>;
export type CopyConsistencyInput = z.infer<typeof CopyConsistencyInputSchema>;
export type QuestionRetrieveInput = z.infer<typeof QuestionRetrieveInputSchema>;
export type InterviewPlanInput = z.infer<typeof InterviewPlanInputSchema>;
export type StoryBuildInput = z.infer<typeof StoryBuildInputSchema>;
export type AnswerEvaluateInput = z.infer<typeof AnswerEvaluateInputSchema>;
export type AnswerCoachInput = z.infer<typeof AnswerCoachInputSchema>;
export type ResumeInterviewCheckInput = z.infer<typeof ResumeInterviewCheckInputSchema>;
export type PiiRedactInput = z.infer<typeof PiiRedactInputSchema>;
export type PromptGuardInput = z.infer<typeof PromptGuardInputSchema>;
export type DocumentParseInput = z.infer<typeof DocumentParseInputSchema>;
export type DocumentOcrInput = z.infer<typeof DocumentOcrInputSchema>;
export type DocumentSegmentInput = z.infer<typeof DocumentSegmentInputSchema>;
export type LayoutRecommendInput = z.infer<typeof LayoutRecommendInputSchema>;
export type ResumeRenderInput = z.infer<typeof ResumeRenderInputSchema>;
export type ExportAuditInput = z.infer<typeof ExportAuditInputSchema>;
export type SpeechTranscribeInput = z.infer<typeof SpeechTranscribeInputSchema>;
export type AccessibilityAuditInput = z.infer<typeof AccessibilityAuditInputSchema>;
export type SecurityAuditInput = z.infer<typeof SecurityAuditInputSchema>;
export type LlmEvalInput = z.infer<typeof LlmEvalInputSchema>;

export type BaselineCapabilityInputMap = {
  "document.parse": DocumentParseInput;
  "document.ocr": DocumentOcrInput;
  "document.segment": DocumentSegmentInput;
  "evidence.mine": EvidenceMineInput;
  "claim.assess": ClaimAssessInput;
  "claim.conflict": ClaimConflictInput;
  "resume.score": ResumeScoreInput;
  "resume.suggest": ResumeSuggestInput;
  "resume.atsAudit": ResumeAtsAuditInput;
  "jd.parse": JdParseInput;
  "job.match": JobMatchInput;
  "job.riskDetect": JobRiskDetectInput;
  "copy.rewrite.zh": CopyRewriteInput;
  "copy.rewrite.en": CopyRewriteInput;
  "copy.consistency": CopyConsistencyInput;
  "question.retrieve": QuestionRetrieveInput;
  "interview.plan": InterviewPlanInput;
  "story.build": StoryBuildInput;
  "answer.evaluate": AnswerEvaluateInput;
  "answer.coach": AnswerCoachInput;
  "resumeInterview.check": ResumeInterviewCheckInput;
  "pii.redact": PiiRedactInput;
  "prompt.guard": PromptGuardInput;
  "layout.recommend": LayoutRecommendInput;
  "resume.render": ResumeRenderInput;
  "export.audit": ExportAuditInput;
  "speech.transcribe": SpeechTranscribeInput;
  "accessibility.audit": AccessibilityAuditInput;
  "security.audit": SecurityAuditInput;
  "llm.eval": LlmEvalInput;
};

export type BaselineCapabilityOutputMap = {
  "document.parse": z.infer<typeof DocumentParseOutputSchema>;
  "document.ocr": z.infer<typeof DocumentOcrOutputSchema>;
  "document.segment": z.infer<typeof DocumentSegmentOutputSchema>;
  "evidence.mine": z.infer<typeof EvidenceMineOutputSchema>;
  "claim.assess": z.infer<typeof ClaimAssessOutputSchema>;
  "claim.conflict": z.infer<typeof ClaimConflictOutputSchema>;
  "resume.score": z.infer<typeof ResumeScoreOutputSchema>;
  "resume.suggest": z.infer<typeof ResumeSuggestOutputSchema>;
  "resume.atsAudit": z.infer<typeof ResumeAtsAuditOutputSchema>;
  "jd.parse": z.infer<typeof JdParseOutputSchema>;
  "job.match": z.infer<typeof JobMatchOutputSchema>;
  "job.riskDetect": z.infer<typeof JobRiskDetectOutputSchema>;
  "copy.rewrite.zh": z.infer<typeof CopyRewriteOutputSchema>;
  "copy.rewrite.en": z.infer<typeof CopyRewriteOutputSchema>;
  "copy.consistency": z.infer<typeof CopyConsistencyOutputSchema>;
  "question.retrieve": z.infer<typeof QuestionRetrieveOutputSchema>;
  "interview.plan": z.infer<typeof InterviewPlanOutputSchema>;
  "story.build": z.infer<typeof StoryBuildOutputSchema>;
  "answer.evaluate": z.infer<typeof AnswerEvaluateOutputSchema>;
  "answer.coach": z.infer<typeof AnswerCoachOutputSchema>;
  "resumeInterview.check": z.infer<typeof ResumeInterviewCheckOutputSchema>;
  "pii.redact": z.infer<typeof PiiRedactOutputSchema>;
  "prompt.guard": z.infer<typeof PromptGuardOutputSchema>;
  "layout.recommend": z.infer<typeof LayoutRecommendOutputSchema>;
  "resume.render": z.infer<typeof ResumeRenderOutputSchema>;
  "export.audit": z.infer<typeof ExportAuditOutputSchema>;
  "speech.transcribe": z.infer<typeof SpeechTranscribeOutputSchema>;
  "accessibility.audit": z.infer<typeof AccessibilityAuditOutputSchema>;
  "security.audit": z.infer<typeof SecurityAuditOutputSchema>;
  "llm.eval": z.infer<typeof LlmEvalOutputSchema>;
};

export type BaselineCapabilityId = keyof BaselineCapabilityInputMap;
