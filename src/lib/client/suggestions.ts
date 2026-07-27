import type { AnalysisBundle } from "./contracts";
import type { Suggestion } from "@/lib/domain";
import { suggestionBeforeHashMatches } from "./resume";

export type SuggestionGenerationSource = "ai" | "rules";

export function suggestionGenerationSource(
  analysis: Pick<AnalysisBundle, "processing">,
): SuggestionGenerationSource {
  const version = analysis.processing.capabilityVersions["resume.suggest"];
  const major = Number(version?.match(/^resume\.suggest@(\d+)\./)?.[1] ?? 0);
  return major >= 2 ? "ai" : "rules";
}

export function safeAiRewriteSuggestions(
  analysis: AnalysisBundle,
): Suggestion[] {
  if (suggestionGenerationSource(analysis) !== "ai") return [];
  return analysis.suggestions.filter(
    (suggestion) =>
      suggestion.status === "pending" &&
      suggestion.resumeRevision === analysis.resume.revision &&
      suggestion.kind === "rewrite" &&
      suggestion.factRisk !== "medium" &&
      suggestion.factRisk !== "high" &&
      Boolean(suggestion.proposedText?.trim()) &&
      suggestion.proposedText !== suggestion.originalText &&
      suggestionBeforeHashMatches(analysis.resume.ast, suggestion),
  );
}
