import type {
  Claim,
  JDRequirement,
  RequirementEvidenceMap,
  ResumeAST,
  ResumeEntry,
  ResumeSection,
  ResumeVariantChange,
} from "@/lib/domain";
import { extractKeywords, keywordOverlap, stableId } from "@/lib/baseline/utils";

type JobVariantInput = {
  ast: ResumeAST;
  targetTitle?: string;
  requirements: JDRequirement[];
  mappings: RequirementEvidenceMap[];
  claims: Claim[];
};

export type JobVariantResult = {
  ast: ResumeAST;
  changes: ResumeVariantChange[];
};

type RankingSignal = {
  requirementId: string;
  importance: number;
  terms: string[];
  claims: Claim[];
};

type ItemRelevance = {
  score: number;
  requirementIds: string[];
  claimIds: string[];
};

function entryText(entry: ResumeEntry) {
  return [
    entry.title,
    entry.subtitle,
    entry.organization,
    entry.location,
    entry.summary,
    ...entry.bullets,
    ...entry.keywords,
  ]
    .filter(Boolean)
    .join("\n");
}

function sectionText(section: ResumeSection) {
  return [
    section.title,
    section.text,
    ...section.entries.map(entryText),
  ]
    .filter(Boolean)
    .join("\n");
}

function signalsFor(input: JobVariantInput): RankingSignal[] {
  const requirements = new Map(
    input.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const claims = new Map(input.claims.map((claim) => [claim.id, claim]));

  return input.mappings.flatMap((mapping) => {
    // Gaps and conflicts can drive coaching, but never resume content. Ranking
    // uses only requirements already supported at least partially by evidence.
    if (mapping.status !== "met" && mapping.status !== "partial") return [];
    const requirement = requirements.get(mapping.requirementId);
    if (!requirement) return [];
    const mappedClaims = mapping.claimIds
      .map((id) => claims.get(id))
      .filter((claim): claim is Claim => Boolean(claim))
      // Conflicting claims must be resolved by the user before they can affect
      // which experience is promoted in a job-specific version.
      .filter((claim) => claim.status !== "conflicting");
    const terms = [
      ...requirement.keywords,
      ...extractKeywords(requirement.text),
    ];
    return [
      {
        requirementId: requirement.id,
        importance:
          requirement.importance * (mapping.status === "met" ? 1 : 0.6),
        terms: [...new Set(terms.map((term) => term.toLowerCase()))],
        claims: mappedClaims,
      },
    ];
  });
}

function relevanceFor(
  text: string,
  sourceBlockIds: readonly string[],
  signals: readonly RankingSignal[],
): ItemRelevance {
  const entitySourceIds = new Set(sourceBlockIds);
  const requirementIds = new Set<string>();
  const claimIds = new Set<string>();
  let score = 0;

  for (const signal of signals) {
    const directOverlap = keywordOverlap(signal.terms, text);
    let signalScore = directOverlap.length * signal.importance;

    for (const claim of signal.claims) {
      const sourceMatch = claim.sourceBlockIds.some((id) =>
        entitySourceIds.has(id),
      );
      const claimTextMatch = keywordOverlap(claim.text, text).length > 0;
      if (!sourceMatch && !claimTextMatch) continue;
      signalScore += signal.importance * (sourceMatch ? 4 : 2);
      if (claim.status === "supported" || claim.status === "user_confirmed") {
        signalScore += signal.importance * 0.25;
      }
      claimIds.add(claim.id);
    }

    if (signalScore <= 0) continue;
    score += signalScore;
    requirementIds.add(signal.requirementId);
  }

  return {
    score,
    requirementIds: [...requirementIds],
    claimIds: [...claimIds],
  };
}

function ranked<T extends { id: string }>(
  items: readonly T[],
  relevance: (item: T) => ItemRelevance,
) {
  return items
    .map((item, index) => ({ item, index, relevance: relevance(item) }))
    .sort(
      (left, right) =>
        right.relevance.score - left.relevance.score ||
        left.index - right.index,
    );
}

function changedOrder(before: readonly string[], after: readonly string[]) {
  return before.some((id, index) => id !== after[index]);
}

function changeEvidence(
  rankings: ReadonlyArray<{ relevance: ItemRelevance }>,
) {
  return {
    requirementIds: [
      ...new Set(rankings.flatMap((item) => item.relevance.requirementIds)),
    ],
    claimIds: [
      ...new Set(rankings.flatMap((item) => item.relevance.claimIds)),
    ],
  };
}

function signalEvidence(signals: readonly RankingSignal[]) {
  return {
    requirementIds: [...new Set(signals.map((signal) => signal.requirementId))],
    claimIds: [
      ...new Set(
        signals.flatMap((signal) =>
          signal.claims.map((claim) => claim.id),
        ),
      ),
    ],
  };
}

function targetHeadline(current: string | undefined, title: string) {
  const trimmedTitle = title.trim();
  const currentValue = current?.trim() ?? "";
  const labeledTarget = currentValue.match(
    /^(.*?(?:求职意向|目标岗位|target\s+(?:role|position))\s*[:：]\s*).*$/iu,
  );
  return labeledTarget ? `${labeledTarget[1]}${trimmedTitle}` : trimmedTitle;
}

function bulletId(entryId: string, bullet: string, index: number) {
  return stableId("variant-bullet", `${entryId}:${index}:${bullet}`);
}

/**
 * Produces a job-targeted AST without rewriting experience facts. The target
 * role may update the headline, while existing sections, entries, and bullets
 * are only stably reordered by evidence-backed relevance.
 */
export function buildJobVariant(input: JobVariantInput): JobVariantResult | null {
  const signals = signalsFor(input);
  const requestedTitle = input.targetTitle?.trim();
  if (signals.length === 0 && !requestedTitle) return null;

  const changes: ResumeVariantChange[] = [];
  const sectionsWithRankedEntries = input.ast.sections.map((section) => {
    const entriesWithRankedBullets = section.entries.map((entry) => {
      if (entry.bullets.length < 2 || signals.length === 0) return entry;
      const bullets = entry.bullets.map((bullet, index) => ({
        id: bulletId(entry.id, bullet, index),
        text: bullet,
      }));
      const rankings = ranked(bullets, (item) =>
        relevanceFor(item.text, entry.sourceBlockIds, signals),
      );
      const beforeIds = bullets.map((item) => item.id);
      const afterIds = rankings.map(({ item }) => item.id);
      if (!changedOrder(beforeIds, afterIds)) return entry;
      const evidence = changeEvidence(rankings);
      changes.push({
        id: stableId(
          "variant-change",
          `bullets:${section.id}:${entry.id}:${beforeIds.join("|")}:${afterIds.join("|")}`,
        ),
        kind: "bullet_reorder",
        path: `/sections/by-id/${section.id}/entries/by-id/${entry.id}/bullets`,
        beforeIds,
        afterIds,
        ...evidence,
        explanation: `将“${entry.title || section.title}”中与目标岗位要求关联更强的要点前置；要点原文保持不变。`,
      });
      return { ...entry, bullets: rankings.map(({ item }) => item.text) };
    });

    if (entriesWithRankedBullets.length < 2 || signals.length === 0) {
      return { ...section, entries: entriesWithRankedBullets };
    }
    const rankings = ranked(entriesWithRankedBullets, (entry) =>
      relevanceFor(entryText(entry), entry.sourceBlockIds, signals),
    );
    const beforeIds = entriesWithRankedBullets.map((entry) => entry.id);
    const afterIds = rankings.map(({ item }) => item.id);
    if (!changedOrder(beforeIds, afterIds)) {
      return { ...section, entries: entriesWithRankedBullets };
    }
    const evidence = changeEvidence(rankings);
    changes.push({
      id: stableId(
        "variant-change",
        `entries:${section.id}:${beforeIds.join("|")}:${afterIds.join("|")}`,
      ),
      kind: "entry_reorder",
      path: `/sections/by-id/${section.id}/entries`,
      beforeIds,
      afterIds,
      ...evidence,
      explanation: `将“${section.title}”中与目标岗位要求关联更强的经历前置；所有经历与原文保持不变。`,
    });
    return { ...section, entries: rankings.map(({ item }) => item) };
  });

  const movableSections = sectionsWithRankedEntries.filter(
    (section) => section.type !== "summary",
  );
  const sectionRankings =
    signals.length > 0
      ? ranked(movableSections, (section) =>
          relevanceFor(
            sectionText(section),
            [
              ...section.sourceBlockIds,
              ...section.entries.flatMap((entry) => entry.sourceBlockIds),
            ],
            signals,
          ),
        )
      : movableSections.map((item, index) => ({
          item,
          index,
          relevance: { score: 0, requirementIds: [], claimIds: [] },
        }));
  const rankedIterator = sectionRankings.map(({ item }) => item)[Symbol.iterator]();
  const reorderedSections = sectionsWithRankedEntries.map((section) =>
    section.type === "summary" ? section : rankedIterator.next().value!,
  );
  const beforeSectionIds = sectionsWithRankedEntries.map((section) => section.id);
  const afterSectionIds = reorderedSections.map((section) => section.id);
  if (changedOrder(beforeSectionIds, afterSectionIds)) {
    const evidence = changeEvidence(sectionRankings);
    changes.unshift({
      id: stableId(
        "variant-change",
        `sections:${beforeSectionIds.join("|")}:${afterSectionIds.join("|")}`,
      ),
      kind: "section_reorder",
      path: "/sections",
      beforeIds: beforeSectionIds,
      afterIds: afterSectionIds,
      ...evidence,
      explanation:
        "按目标岗位要求与现有简历证据的关联度调整章节顺序；简介位置及全部原文保持不变。",
    });
  }

  const nextHeadline = requestedTitle
    ? targetHeadline(input.ast.contact.headline, requestedTitle)
    : undefined;
  if (
    nextHeadline &&
    nextHeadline.trim() !== (input.ast.contact.headline?.trim() ?? "")
  ) {
    changes.unshift({
      id: stableId(
        "variant-change",
        `headline:${input.ast.contact.headline ?? ""}:${nextHeadline}`,
      ),
      kind: "headline_update",
      path: "/contact/headline",
      beforeText: input.ast.contact.headline ?? "",
      afterText: nextHeadline,
      ...signalEvidence(signals),
      explanation: `将求职意向更新为“${nextHeadline}”；该变更只表示本次目标岗位，不新增任何经历或能力事实。`,
    });
  }

  if (changes.length === 0) return null;
  return {
    ast: {
      ...input.ast,
      contact: nextHeadline
        ? { ...input.ast.contact, headline: nextHeadline }
        : input.ast.contact,
      sections: reorderedSections,
    },
    changes,
  };
}
