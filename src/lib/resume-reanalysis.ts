import type { AnalysisBundle } from "@/lib/client/contracts";
import type {
  Claim,
  EvidenceAsset,
  InterviewStory,
  ResumeDocument,
  ScoreDimension,
  Scorecard,
  Suggestion,
} from "@/lib/domain";
import {
  claimParts,
  clamp,
  excerpt,
  extractKeywords,
  keywordOverlap,
  normalizeText,
  numericTokens,
  round,
  splitStatements,
  stableId,
} from "@/lib/baseline/utils";

type ResumeLine = {
  text: string;
  sourceBlockIds: string[];
};

export type RevisionReanalysis = Pick<
  AnalysisBundle,
  "claims" | "evidence" | "scorecard" | "stories"
> & {
  capabilityVersions: Record<string, string>;
};

const DIMENSION_LABELS: Record<ScoreDimension["id"], string> = {
  impact: "成果与影响力",
  completeness: "信息完整性",
  clarity: "清晰与精炼",
  structure: "结构与版式",
  ats: "ATS 可解析性",
  language: "语言规范性",
};

function allResumeLines(resume: ResumeDocument): ResumeLine[] {
  const lines: ResumeLine[] = [];
  if (resume.ast.summary) {
    lines.push({ text: resume.ast.summary, sourceBlockIds: [] });
  }
  for (const section of resume.ast.sections) {
    if (section.text) {
      for (const text of splitStatements(section.text)) {
        lines.push({ text, sourceBlockIds: section.sourceBlockIds });
      }
    }
    for (const entry of section.entries) {
      if (entry.summary) {
        lines.push({
          text: entry.summary,
          sourceBlockIds: entry.sourceBlockIds,
        });
      }
      for (const text of entry.bullets) {
        lines.push({ text, sourceBlockIds: entry.sourceBlockIds });
      }
    }
  }
  return lines
    .map((line) => ({ ...line, text: normalizeText(line.text) }))
    .filter((line) => line.text.length >= 4);
}

function sameSources(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((sourceId) => right.includes(sourceId))
  );
}

function sourcesOverlap(left: readonly string[], right: readonly string[]) {
  return left.some((sourceId) => right.includes(sourceId));
}

function claimForLine(
  resume: ResumeDocument,
  line: ResumeLine,
  index: number,
  previousClaims: readonly Claim[],
  usedPreviousClaimIds: Set<string>,
  preferredPreviousClaims: readonly Claim[] = [],
) {
  const candidates = previousClaims.filter(
    (claim) =>
      !usedPreviousClaimIds.has(claim.id) &&
      normalizeText(claim.text) === line.text,
  );
  const previous =
    preferredPreviousClaims.find(
      (claim) =>
        !usedPreviousClaimIds.has(claim.id) &&
        (claim.sourceBlockIds.length === 0 ||
          line.sourceBlockIds.length === 0 ||
          sourcesOverlap(claim.sourceBlockIds, line.sourceBlockIds)),
    ) ??
    candidates.find((claim) =>
      sameSources(claim.sourceBlockIds, line.sourceBlockIds),
    ) ??
    candidates.find((claim) =>
      sourcesOverlap(claim.sourceBlockIds, line.sourceBlockIds),
    ) ??
    candidates.find(
      (claim) =>
        claim.sourceBlockIds.length === 0 && line.sourceBlockIds.length === 0,
    );
  if (previous) usedPreviousClaimIds.add(previous.id);
  const parts = claimParts(line.text);
  return {
    id: previous?.id ?? stableId("claim", `${resume.id}:${index}:${line.text}`),
    text: line.text,
    action: parts.action,
    method: parts.method,
    result: parts.result,
    sourceBlockIds: line.sourceBlockIds,
    evidenceAssetIds: [] as string[],
    status: "resume_only" as const,
    confidence: line.sourceBlockIds.length ? 0.7 : 0.6,
    missingInformation: parts.missingInformation,
  } satisfies Claim;
}

function scoreDimension(
  id: ScoreDimension["id"],
  score: number,
  maxScore: number,
  deductions: string[],
  evidence: string[] = [],
): ScoreDimension {
  return {
    id,
    label: DIMENSION_LABELS[id],
    score: round(clamp(score, 0, maxScore), 1),
    maxScore,
    evidence,
    deductions,
  };
}

function scoreResume(resume: ResumeDocument, claims: Claim[]): Scorecard {
  const entries = resume.ast.sections.flatMap((section) => section.entries);
  const bullets = entries.flatMap((entry) => entry.bullets);
  const metricBullets = bullets.filter(
    (bullet) => numericTokens(bullet).length > 0,
  );
  const contact = resume.ast.contact;
  const sectionTypes = new Set(
    resume.ast.sections.map((section) => section.type),
  );
  const averageBulletLength = bullets.length
    ? bullets.reduce((sum, bullet) => sum + bullet.length, 0) / bullets.length
    : 0;
  const lowConfidenceBlocks = resume.sourceBlocks.filter(
    (block) => block.confidence < 0.75,
  );
  const inconsistentPunctuation =
    bullets.some((bullet) => /[。.]$/.test(bullet)) &&
    bullets.some((bullet) => !/[。.]$/.test(bullet));

  const dimensions = [
    scoreDimension(
      "impact",
      8 +
        Math.min(9, metricBullets.length * 2.25) +
        Math.min(8, claims.filter((claim) => claim.result).length),
      25,
      metricBullets.length ? [] : ["经历描述缺少可核实的结果或影响"],
      metricBullets.slice(0, 3),
    ),
    scoreDimension(
      "completeness",
      4 +
        (contact.name ? 2 : 0) +
        (contact.email || contact.phone ? 2 : 0) +
        (sectionTypes.has("experience") ? 3 : 0) +
        (sectionTypes.has("education") ? 2 : 0) +
        (sectionTypes.has("skills") ? 2 : 0),
      15,
      [
        ...(!contact.name ? ["缺少姓名"] : []),
        ...(!contact.email && !contact.phone ? ["缺少可用联系方式"] : []),
        ...(!sectionTypes.has("experience") ? ["缺少经历板块"] : []),
      ],
    ),
    scoreDimension(
      "clarity",
      9 +
        (bullets.length ? 3 : 0) +
        (averageBulletLength > 0 && averageBulletLength <= 120 ? 3 : 0),
      15,
      [
        ...(averageBulletLength > 120 ? ["部分要点过长，影响快速浏览"] : []),
        ...(!bullets.length ? ["缺少可扫描的要点列表"] : []),
      ],
    ),
    scoreDimension(
      "structure",
      7 + Math.min(5, sectionTypes.size) + (entries.length ? 3 : 0),
      15,
      resume.ast.sections.length ? [] : ["未识别到稳定的板块层级"],
    ),
    scoreDimension(
      "ats",
      15 -
        Math.min(6, lowConfidenceBlocks.length) -
        (resume.parseMethod === "ocr" ? 2 : 0),
      15,
      [
        ...(lowConfidenceBlocks.length
          ? [`${lowConfidenceBlocks.length} 个文本块解析置信度较低`]
          : []),
        ...(resume.parseMethod === "ocr" ? ["全文依赖 OCR，建议人工核对"] : []),
      ],
    ),
    scoreDimension(
      "language",
      12 + (bullets.length ? 2 : 0) - (inconsistentPunctuation ? 2 : 0),
      15,
      inconsistentPunctuation ? ["要点结尾标点不一致"] : [],
    ),
  ];
  const total = round(
    dimensions.reduce((sum, dimension) => sum + dimension.score, 0),
    1,
  );
  return {
    resumeId: resume.id,
    resumeRevision: resume.revision,
    total,
    dimensions,
    summary:
      total >= 85
        ? "结构与内容基础扎实，可继续做岗位定制。"
        : total >= 70
          ? "基础完整，优先补强成果证据与表达密度。"
          : "建议先补齐核心信息和可核实的经历证据。",
    sourceVersion: "resume.score@1.0.0",
  };
}

function storyForClaim(
  claim: Claim,
  evidenceAssets: readonly EvidenceAsset[],
): InterviewStory {
  const linked = evidenceAssets.filter((asset) =>
    claim.evidenceAssetIds.includes(asset.id),
  );
  const parts = claimParts(claim.text);
  return {
    id: stableId("story", claim.id),
    title: excerpt(claim.text, 32),
    situation: claim.subject ?? "待补充：当时的背景与约束",
    task: "待补充：你需要达成的具体目标",
    action: claim.action ?? parts.action,
    result: claim.result ?? "待补充：可核实的结果或影响",
    claimIds: [claim.id],
    evidenceAssetIds: linked.map((asset) => asset.id),
    keywords: extractKeywords(claim.text).slice(0, 10),
    riskNotes: [
      ...(claim.status === "needs_evidence" || claim.status === "conflicting"
        ? ["当前声明仍待核对，练习时不要补造细节。"]
        : []),
      ...(!claim.result ? ["结果尚不完整，回答前应补充真实信息。"] : []),
    ],
  };
}

function externalEvidenceForClaim(
  claim: Claim,
  evidenceById: ReadonlyMap<string, EvidenceAsset>,
) {
  return claim.evidenceAssetIds
    .map((evidenceId) => evidenceById.get(evidenceId))
    .filter((asset): asset is EvidenceAsset =>
      Boolean(asset && asset.kind !== "resume_text"),
    );
}

function assessClaim(
  claim: Claim,
  evidenceById: ReadonlyMap<string, EvidenceAsset>,
): Claim {
  const linked = claim.evidenceAssetIds
    .map((evidenceId) => evidenceById.get(evidenceId))
    .filter((asset): asset is EvidenceAsset => Boolean(asset));
  const independentlySupported = linked.some(
    (asset) =>
      asset.kind !== "resume_text" &&
      asset.kind !== "user_statement" &&
      asset.verifiedByUser,
  );
  const userConfirmed = linked.some(
    (asset) => asset.kind === "user_statement" && asset.verifiedByUser,
  );
  const hasResumeSource =
    linked.some((asset) => asset.kind === "resume_text") ||
    claim.sourceBlockIds.length > 0;
  return {
    ...claim,
    status: independentlySupported
      ? "supported"
      : userConfirmed
        ? "user_confirmed"
        : hasResumeSource
          ? "resume_only"
          : "needs_evidence",
    confidence: independentlySupported
      ? 0.92
      : userConfirmed
        ? 0.82
        : hasResumeSource
          ? 0.65
          : 0.3,
  };
}

function markConflicts(claims: Claim[]) {
  const conflictingIds = new Set<string>();
  for (let left = 0; left < claims.length; left += 1) {
    for (let right = left + 1; right < claims.length; right += 1) {
      const a = claims[left];
      const b = claims[right];
      const shared = keywordOverlap(a.text, b.text);
      const aNumbers = numericTokens(a.text);
      const bNumbers = numericTokens(b.text);
      if (
        shared.length >= 2 &&
        aNumbers.length > 0 &&
        bNumbers.length > 0 &&
        !aNumbers.some((number) => bNumbers.includes(number))
      ) {
        conflictingIds.add(a.id);
        conflictingIds.add(b.id);
      }
    }
  }
  return claims.map((claim) =>
    conflictingIds.has(claim.id)
      ? {
          ...claim,
          status: "conflicting" as const,
          confidence: Math.min(claim.confidence, 0.65),
        }
      : claim,
  );
}

export function reanalyzeResumeRevision(input: {
  analysis: AnalysisBundle;
  resume: ResumeDocument;
  appliedSuggestion?: Suggestion;
  manualText?: string;
}): RevisionReanalysis {
  const { analysis, resume, appliedSuggestion } = input;
  const previousEvidenceById = new Map(
    analysis.evidence.map((asset) => [asset.id, asset]),
  );
  const previousClaimsById = new Map(
    analysis.claims.map((claim) => [claim.id, claim]),
  );
  const targetPreviousClaims = (appliedSuggestion?.claimIds ?? [])
    .map((claimId) => previousClaimsById.get(claimId))
    .filter((claim): claim is Claim => Boolean(claim));
  if (appliedSuggestion && targetPreviousClaims.length === 0) {
    targetPreviousClaims.push(
      ...analysis.claims.filter(
        (claim) =>
          normalizeText(claim.text) ===
            normalizeText(appliedSuggestion.originalText) &&
          (appliedSuggestion.sourceBlockIds.length === 0 ||
            sourcesOverlap(
              claim.sourceBlockIds,
              appliedSuggestion.sourceBlockIds,
            )),
      ),
    );
  }
  const finalText = normalizeText(
    input.manualText ?? appliedSuggestion?.proposedText ?? "",
  );
  const manualEvidence =
    appliedSuggestion && input.manualText && finalText
      ? ({
          id:
            targetPreviousClaims
              .flatMap((claim) => claim.evidenceAssetIds)
              .map((evidenceId) => previousEvidenceById.get(evidenceId))
              .find((asset) => asset?.kind === "user_statement")?.id ??
            `user-statement-${
              targetPreviousClaims[0]?.id ??
              stableId("claim", `${resume.id}:${resume.revision}:${finalText}`)
            }`,
          kind: "user_statement",
          label: "用户手动确认的简历表述",
          content: finalText,
          sourceBlockIds: [],
          verifiedByUser: true,
          confidence: 0.9,
        } satisfies EvidenceAsset)
      : null;

  const lines = allResumeLines(resume);
  const usedPreviousClaimIds = new Set<string>();
  const evidence: EvidenceAsset[] = [];
  const evidenceIndexes = new Map<string, number>();
  const addEvidence = (asset: EvidenceAsset) => {
    const existingIndex = evidenceIndexes.get(asset.id);
    if (existingIndex !== undefined) {
      evidence[existingIndex] = asset;
      return;
    }
    evidenceIndexes.set(asset.id, evidence.length);
    evidence.push(asset);
  };
  const claims = lines.map((line, index) => {
    const isAppliedTarget =
      appliedSuggestion !== undefined &&
      finalText.length > 0 &&
      line.text === finalText &&
      ((appliedSuggestion?.sourceBlockIds.length ?? 0) === 0 ||
        sourcesOverlap(line.sourceBlockIds, appliedSuggestion.sourceBlockIds));
    const claim = claimForLine(
      resume,
      line,
      index,
      analysis.claims,
      usedPreviousClaimIds,
      isAppliedTarget ? targetPreviousClaims : [],
    );
    const resumeEvidence: EvidenceAsset = {
      id: stableId("evidence", `${resume.id}:${index}:${line.text}`),
      kind: "resume_text",
      label: `简历当前版本 ${index + 1}`,
      content: line.text,
      sourceBlockIds: line.sourceBlockIds,
      verifiedByUser: false,
      confidence: line.sourceBlockIds.length ? 0.7 : 0.6,
    };
    addEvidence(resumeEvidence);
    claim.evidenceAssetIds.push(resumeEvidence.id);

    const exactPrevious = analysis.claims.find(
      (candidate) => candidate.id === claim.id,
    );
    const evidenceSources = [
      ...(exactPrevious ? [exactPrevious] : []),
      ...(isAppliedTarget ? targetPreviousClaims : []),
    ];
    for (const asset of evidenceSources.flatMap((candidate) =>
      externalEvidenceForClaim(candidate, previousEvidenceById),
    )) {
      addEvidence(asset);
      claim.evidenceAssetIds.push(asset.id);
    }
    if (isAppliedTarget && manualEvidence) {
      addEvidence(manualEvidence);
      claim.evidenceAssetIds.push(manualEvidence.id);
    }
    claim.evidenceAssetIds = [...new Set(claim.evidenceAssetIds)];
    return claim;
  });
  const currentEvidenceById = new Map(
    evidence.map((asset) => [asset.id, asset]),
  );
  const assessedClaims = markConflicts(
    claims.map((claim) => assessClaim(claim, currentEvidenceById)),
  );
  const scorecard = scoreResume(resume, assessedClaims);
  const stories = assessedClaims
    .slice(0, 8)
    .map((claim) => storyForClaim(claim, evidence));

  return {
    claims: assessedClaims,
    evidence,
    scorecard,
    stories,
    capabilityVersions: {
      "evidence.mine": "evidence.mine@1.0.0",
      "claim.assess": "claim.assess@1.0.0",
      "claim.conflict": "claim.conflict@1.0.0",
      "resume.score": "resume.score@1.0.0",
      ...(stories.length ? { "story.build": "story.build@1.0.0" } : {}),
    },
  };
}
