import type { AnalysisBundle } from "./contracts";
import type { ScoreDimension, Scorecard, Suggestion } from "@/lib/domain";
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
      Boolean(suggestion.proposedText?.trim()) &&
      suggestion.proposedText !== suggestion.originalText &&
      suggestionBeforeHashMatches(analysis.resume.ast, suggestion),
  );
}

export function ensureSuggestionScoreGains(
  suggestions: Suggestion[],
  currentScore: number,
): Suggestion[] {
  if (
    suggestions.length === 0 ||
    suggestions.some((suggestion) => (suggestion.scoreGain ?? 0) > 0)
  ) {
    return suggestions;
  }
  const gap = Math.max(0, 100 - Math.round(currentScore));
  const base = Math.floor(gap / suggestions.length);
  const remainder = gap % suggestions.length;
  return suggestions.map((suggestion, index) => ({
    ...suggestion,
    scoreGain: base + (index < remainder ? 1 : 0),
  }));
}

const SETTLED_STATUSES = new Set<Suggestion["status"]>([
  "accepted",
  "manual",
  "rejected",
]);

function addDimensionGain(
  dimensions: ScoreDimension[],
  suggestion: Suggestion,
) {
  let remaining = suggestion.scoreGain ?? 0;
  const affected = new Set(suggestion.affectedDimensions);
  while (remaining > 0) {
    const eligible = dimensions
      .filter(
        (dimension) =>
          dimension.score < dimension.maxScore &&
          (affected.size === 0 || affected.has(dimension.id)),
      )
      .sort(
        (left, right) =>
          right.maxScore -
          right.score -
          (left.maxScore - left.score),
      );
    const target =
      eligible[0] ??
      dimensions
        .filter((dimension) => dimension.score < dimension.maxScore)
        .sort(
          (left, right) =>
            right.maxScore -
            right.score -
            (left.maxScore - left.score),
        )[0];
    if (!target) break;
    target.score += 1;
    remaining -= 1;
  }
}

export function settleSuggestionScorecard(
  analysis: AnalysisBundle,
  suggestions: Suggestion[],
  resumeRevision: number,
): Scorecard {
  const previouslySettled = new Set(
    analysis.suggestions
      .filter((suggestion) => SETTLED_STATUSES.has(suggestion.status))
      .map((suggestion) => suggestion.id),
  );
  const newlySettled = suggestions.filter(
    (suggestion) =>
      SETTLED_STATUSES.has(suggestion.status) &&
      !previouslySettled.has(suggestion.id),
  );
  const complete =
    suggestions.length > 0 &&
    suggestions.every((suggestion) => SETTLED_STATUSES.has(suggestion.status));
  const dimensions = analysis.scorecard.dimensions.map((dimension) => ({
    ...dimension,
  }));
  for (const suggestion of newlySettled) {
    addDimensionGain(dimensions, suggestion);
  }
  if (complete) {
    for (const dimension of dimensions) dimension.score = dimension.maxScore;
  }
  const gain = newlySettled.reduce(
    (sum, suggestion) => sum + suggestion.scoreGain,
    0,
  );

  return {
    ...analysis.scorecard,
    resumeRevision,
    total: complete ? 100 : Math.min(100, analysis.scorecard.total + gain),
    dimensions,
    summary: complete
      ? "本次优化清单已全部处理完成。"
      : `本次优化清单已结算 ${suggestions.length - suggestions.filter((item) => item.status === "pending").length}/${suggestions.length} 条。`,
  };
}
