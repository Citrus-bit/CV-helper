import { z } from "zod";

import { LocaleSchema } from "@/lib/domain";

export const CAPABILITY_IDS = [
  "document.parse",
  "document.ocr",
  "document.segment",
  "evidence.mine",
  "claim.assess",
  "claim.conflict",
  "resume.score",
  "resume.suggest",
  "resume.chat",
  "resume.atsAudit",
  "jd.parse",
  "job.match",
  "job.riskDetect",
  "copy.rewrite.zh",
  "copy.rewrite.en",
  "copy.consistency",
  "layout.recommend",
  "resume.render",
  "export.audit",
  "question.retrieve",
  "interview.plan",
  "story.build",
  "speech.transcribe",
  "answer.evaluate",
  "answer.coach",
  "resumeInterview.check",
  "pii.redact",
  "prompt.guard",
  "accessibility.audit",
  "security.audit",
  "llm.eval",
] as const;

export const PROVIDER_GATEWAY_CAPABILITY_IDS = [
  "resume.score",
  "resume.suggest",
  "resume.chat",
  "jd.parse",
  "job.match",
  "copy.rewrite.zh",
  "copy.rewrite.en",
  "layout.recommend",
  "interview.plan",
  "answer.evaluate",
  "answer.coach",
] as const satisfies readonly (typeof CAPABILITY_IDS)[number][];

export const CapabilityIdSchema = z.enum(CAPABILITY_IDS);
export type CapabilityId = z.infer<typeof CapabilityIdSchema>;
export type ProviderGatewayCapabilityId = (typeof PROVIDER_GATEWAY_CAPABILITY_IDS)[number];

export const DataScopeSchema = z.enum([
  "original_pdf",
  "page_image",
  "selected_text",
  "source_blocks",
  "resume_ast",
  "evidence_graph",
  "job_description",
  "interview_content",
  "audio",
  "rendered_document",
  "ui_render_tree",
  "system_metadata",
  "eval_fixtures",
  "anonymous_metadata",
]);
export type DataScope = z.infer<typeof DataScopeSchema>;

export const NetworkPolicySchema = z.enum(["none", "provider_only", "allowlist"]);
export type NetworkPolicy = z.infer<typeof NetworkPolicySchema>;

export const CapabilityDescriptorSchema = z.object({
  id: CapabilityIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  contractVersion: z.string().regex(/^\d+\.\d+$/),
  locales: z.array(LocaleSchema).min(1),
  license: z.string().min(1),
  provenance: z.string().min(1),
  dataScopes: z.array(DataScopeSchema),
  networkPolicy: NetworkPolicySchema,
  timeoutMs: z.number().int().positive(),
  fallbackImplementation: z.string().min(1),
});
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;

export const CapabilityContextSchema = z.object({
  sessionId: z.string().min(1),
  locale: LocaleSchema,
  grantedDataScopes: z.array(DataScopeSchema),
  traceId: z.string().min(1),
  deadlineAt: z.string().datetime(),
});
export type SerializableCapabilityContext = z.infer<typeof CapabilityContextSchema>;
export type CapabilityContext = Omit<SerializableCapabilityContext, "grantedDataScopes"> & {
  readonly grantedDataScopes: readonly DataScope[];
  signal?: AbortSignal;
};

export const CapabilityWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).strict();
export type CapabilityWarning = z.infer<typeof CapabilityWarningSchema>;

export const CapabilityUsageSchema = z.object({
  inputUnits: z.number().nonnegative().optional(),
  outputUnits: z.number().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().optional(),
}).strict();
export type CapabilityUsage = z.infer<typeof CapabilityUsageSchema>;

export function capabilityResultSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    confidence: z.number().min(0).max(1),
    evidenceReferences: z.array(z.string()),
    warnings: z.array(CapabilityWarningSchema),
    sourceVersion: z.string().min(1),
    durationMs: z.number().nonnegative(),
    usage: CapabilityUsageSchema.optional(),
    usedFallback: z.boolean(),
  }).strict();
}

export function capabilityExecutionSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    confidence: z.number().min(0).max(1).optional(),
    evidenceReferences: z.array(z.string().min(1)).optional(),
    warnings: z.array(CapabilityWarningSchema).optional(),
    usage: CapabilityUsageSchema.optional(),
  }).strict();
}

export interface CapabilityResult<T> {
  data: T;
  confidence: number;
  evidenceReferences: string[];
  warnings: CapabilityWarning[];
  sourceVersion: string;
  durationMs: number;
  usage?: CapabilityUsage;
  usedFallback: boolean;
}

export interface CapabilityExecution<T> {
  data: T;
  confidence?: number;
  evidenceReferences?: string[];
  warnings?: CapabilityWarning[];
  usage?: CapabilityUsage;
}

export interface Capability<I, O> {
  descriptor: CapabilityDescriptor;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  execute(input: I, context: CapabilityContext): Promise<CapabilityExecution<O>> | CapabilityExecution<O>;
}

export const SkillManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  kind: z.enum(["adapter", "rule_pack", "knowledge_pack", "prompt_policy"]),
  contractVersion: z.string().regex(/^\d+\.\d+$/),
  capabilities: z.array(CapabilityIdSchema).min(1),
  locales: z.array(LocaleSchema).min(1),
  dataScopes: z.array(DataScopeSchema),
  networkPolicy: NetworkPolicySchema,
  license: z.string().min(1),
  provenance: z.string().min(1),
  evalSuiteId: z.string().min(1),
});
export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export const FeatureAvailabilitySchema = z.object({
  id: CapabilityIdSchema,
  available: z.boolean(),
  mode: z.enum(["enhanced", "baseline", "unavailable"]),
  locales: z.array(LocaleSchema),
  fallbackAvailable: z.boolean(),
});
export type FeatureAvailability = z.infer<typeof FeatureAvailabilitySchema>;

export class CapabilityInvocationError extends Error {
  constructor(
    public readonly capabilityId: CapabilityId,
    public readonly code:
      | "UNAVAILABLE"
      | "INVALID_CONTEXT"
      | "DATA_SCOPE_DENIED"
      | "INVALID_INPUT"
      | "TIMEOUT"
      | "CANCELLED"
      | "EXECUTION_FAILED"
      | "INVALID_OUTPUT",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CapabilityInvocationError";
  }
}
