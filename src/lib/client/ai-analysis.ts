import type { AnalysisBundle } from "./contracts";

export function isDemoTemplateAnalysis(
  analysis: AnalysisBundle | null | undefined,
) {
  return analysis?.processing.analysisSource === "demo-template";
}

export function isRequiredAiSource(
  capabilityId: "resume.score" | "resume.suggest",
  source: string | undefined,
) {
  if (!source) return false;
  const escaped = capabilityId.replace(".", "\\.");
  const match = source.match(new RegExp(`^${escaped}@(\\d+)\\.`));
  return Number(match?.[1] ?? 0) >= 2;
}

export function hasFreshRequiredAiAnalysis(
  analysis: AnalysisBundle | null | undefined,
) {
  if (!analysis) return false;
  const metadata = analysis.processing.aiAnalysis;
  return Boolean(
    hasRequiredAiProvenance(analysis) &&
      metadata &&
      metadata.status === "fresh" &&
      metadata.analyzedRevision === analysis.resume.revision &&
      analysis.scorecard.resumeId === analysis.resume.id &&
      analysis.scorecard.resumeRevision === analysis.resume.revision,
  );
}

export function hasRequiredAiProvenance(
  analysis: AnalysisBundle | null | undefined,
) {
  if (!analysis) return false;
  const metadata = analysis.processing.aiAnalysis;
  return Boolean(
    metadata &&
      isRequiredAiSource("resume.score", metadata.scoreSourceVersion) &&
      isRequiredAiSource(
        "resume.suggest",
        metadata.suggestionSourceVersion,
      ) &&
      analysis.processing.capabilityVersions["resume.score"] ===
        metadata.scoreSourceVersion &&
      analysis.processing.capabilityVersions["resume.suggest"] ===
        metadata.suggestionSourceVersion,
  );
}
