import { z } from "zod";

import { ClaimSchema, ResumeDocumentSchema, SuggestionSchema } from "@/lib/domain";

export const RESUME_CHAT_MAX_MESSAGES = 100;
export const RESUME_CHAT_CONTEXT_WINDOW = 10;

export const ResumeChatMessageSchema = z
  .object({
    id: z.string().min(1).max(160),
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(6_000),
    createdAt: z.string().datetime(),
    resumeRevision: z.number().int().nonnegative(),
    suggestionIds: z.array(z.string().min(1).max(160)).max(8).default([]),
  })
  .strict();
export type ResumeChatMessage = z.infer<typeof ResumeChatMessageSchema>;

export const ResumeChatContextSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceResumeId: z.string().min(1),
    sourceResumeRevision: z.number().int().nonnegative(),
    summary: z.string().max(4_000).default(""),
    confirmedFacts: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
    recentChanges: z.array(z.string().trim().min(1).max(1_000)).max(50).default([]),
    messages: z.array(ResumeChatMessageSchema).max(RESUME_CHAT_MAX_MESSAGES).default([]),
  })
  .strict();
export type ResumeChatContext = z.infer<typeof ResumeChatContextSchema>;

export const ResumeChatTurnSchema = ResumeChatMessageSchema.pick({
  role: true,
  content: true,
  resumeRevision: true,
}).strict();

export const ResumeChatInputSchema = z
  .object({
    resume: ResumeDocumentSchema,
    claims: z.array(ClaimSchema).max(500),
    summary: z.string().max(4_000),
    confirmedFacts: z.array(z.string().trim().min(1).max(1_000)).max(100),
    recentChanges: z.array(z.string().trim().min(1).max(1_000)).max(50),
    recentMessages: z.array(ResumeChatTurnSchema).max(RESUME_CHAT_CONTEXT_WINDOW),
    userMessage: z.string().trim().min(1).max(4_000),
  })
  .strict();
export type ResumeChatInput = z.infer<typeof ResumeChatInputSchema>;

export const ResumeChatOutputSchema = z
  .object({
    reply: z.string().trim().min(1).max(6_000),
    summary: z.string().trim().min(1).max(4_000),
    confirmedFacts: z.array(z.string().trim().min(2).max(1_000)).max(8),
    suggestions: z.array(SuggestionSchema).max(8),
  })
  .strict();
export type ResumeChatOutput = z.infer<typeof ResumeChatOutputSchema>;

export const ResumeChatResponseSchema = ResumeChatOutputSchema.extend({
  sourceVersion: z.string().min(1),
  durationMs: z.number().nonnegative(),
}).strict();
export type ResumeChatResponse = z.infer<typeof ResumeChatResponseSchema>;

export function emptyResumeChatContext(
  sourceResumeId: string,
  sourceResumeRevision: number,
): ResumeChatContext {
  return {
    schemaVersion: 1,
    sourceResumeId,
    sourceResumeRevision,
    summary: "",
    confirmedFacts: [],
    recentChanges: [],
    messages: [],
  };
}

export function normalizeResumeChatContext(
  value: unknown,
  sourceResumeId: string,
  sourceResumeRevision: number,
): ResumeChatContext {
  const parsed = ResumeChatContextSchema.safeParse(value);
  if (!parsed.success || parsed.data.sourceResumeId !== sourceResumeId) {
    return emptyResumeChatContext(sourceResumeId, sourceResumeRevision);
  }
  return {
    ...parsed.data,
    sourceResumeRevision,
    messages: parsed.data.messages.slice(-RESUME_CHAT_MAX_MESSAGES),
  };
}

export function resumeChatConfirmedFacts(
  context: ResumeChatContext,
  claims: z.infer<typeof ClaimSchema>[],
): string[] {
  return [
    ...new Set([
      ...context.confirmedFacts,
      ...claims
        .filter((claim) => claim.status === "user_confirmed" || claim.status === "supported")
        .map((claim) => claim.text.trim()),
    ]),
  ]
    .filter(Boolean)
    .slice(-100);
}
