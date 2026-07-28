import "server-only";

import { AI_CAPABILITY_TIMEOUT_MS } from "@/lib/capabilities/catalog";
import { ResumeAnalysisResponseSchema } from "@/lib/client/contracts";
import type { Claim, ResumeDocument } from "@/lib/domain";

import { createCapabilityContext } from "./analysis";
import {
  invokeRequiredAiCapability,
  isEnhancedAiSourceVersion,
} from "./capability-runtime";
import { AiAnalysisUnavailableError } from "./ai/required-ai";

export function assertResumeAnalysisResponseForRequest(
  value: unknown,
  resume: ResumeDocument,
) {
  const result = ResumeAnalysisResponseSchema.parse(value);
  // A late response for another revision is valid data but invalid for this
  // request. Reject it here as well as on the client to prevent stale scores
  // or suggestions from being attached to edited resume content.
  const scoreInvalid =
    result.resumeId !== resume.id ||
    result.resumeRevision !== resume.revision ||
    result.scorecard.resumeId !== resume.id ||
    result.scorecard.resumeRevision !== resume.revision ||
    !isEnhancedAiSourceVersion(
      "resume.score",
      result.capabilityVersions["resume.score"],
    );
  const suggestionsInvalid =
    !isEnhancedAiSourceVersion(
      "resume.suggest",
      result.capabilityVersions["resume.suggest"],
    ) ||
    result.suggestions.some(
      (suggestion) => suggestion.resumeRevision !== resume.revision,
    );
  if (scoreInvalid || suggestionsInvalid) {
    throw new AiAnalysisUnavailableError(
      scoreInvalid ? "resume.score" : "resume.suggest",
      "invalid_response",
      true,
    );
  }
  return result;
}

export async function analyzeResumeRevisionWithAi(input: {
  resume: ResumeDocument;
  claims: Claim[];
  signal?: AbortSignal;
}) {
  const startedAt = performance.now();
  const context = createCapabilityContext(
    input.resume.locale,
    ["source_blocks", "resume_ast", "evidence_graph"],
    input.signal,
    AI_CAPABILITY_TIMEOUT_MS,
  );
  const scoreResult = await invokeRequiredAiCapability(
    "resume.score",
    { resume: input.resume, claims: input.claims },
    context,
  );
  // Suggestions are intentionally generated after scoring: their priorities
  // must explain the same scorecard that the user sees. Returning only after
  // both calls succeed also prevents a partially analyzed revision.
  const suggestionResult = await invokeRequiredAiCapability(
    "resume.suggest",
    {
      resume: input.resume,
      claims: input.claims,
      scoreContext: scoreResult.data,
    },
    context,
  );
  return assertResumeAnalysisResponseForRequest(
    {
      resumeId: input.resume.id,
      resumeRevision: input.resume.revision,
      scorecard: {
        ...scoreResult.data,
        sourceVersion: scoreResult.sourceVersion,
      },
      suggestions: suggestionResult.data.suggestions,
      capabilityVersions: {
        "resume.score": scoreResult.sourceVersion,
        "resume.suggest": suggestionResult.sourceVersion,
      },
      durationMs: Math.max(0, performance.now() - startedAt),
    },
    input.resume,
  );
}
