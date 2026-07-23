"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  AnalysisBundleSchema,
  EvaluationResponseSchema,
  InterviewPlanSchema,
  JobMatchBundleSchema,
  dedupeConsistencyWarnings,
  type AnalysisBundle,
  type EvaluationResponse,
  type InterviewPlan,
  type JobMatchBundle,
  type RenderResponse,
} from "./contracts";
import type {
  Claim,
  EvidenceAsset,
  InterviewStory,
  ResumeAST,
  Scorecard,
  Suggestion,
  SuggestionPatch,
  SuggestionStatus,
} from "@/lib/domain";
import {
  claimParts,
  excerpt,
  extractKeywords,
  stableId,
} from "@/lib/baseline/utils";
import { cancelAnalysisRequest } from "./analysis-request";
import {
  base64ToPdfBlob,
  blobToBase64,
  clearRecentAnalyses,
  deleteRecentAnalysis,
  getRecentAnalysis,
  listRecentAnalyses,
  saveRecentAnalysis,
  sha256Blob,
  type RecentAnalysisInvalidation,
  type RecentAnalysisPayload,
  type RecentAnalysisSummary,
} from "./recent-analysis";
import { applySuggestion } from "./resume";
import { clearApiSessionId } from "./privacy";
import {
  cancelAllClientRequests,
  clearRegisteredClientCaches,
  disposeRegisteredClientRuntimeActivities,
  revokeAllTrackedObjectUrls,
} from "./runtime-resources";

export const SESSION_STORAGE_KEY_V2 = "resume-assistant-session-v2";
export const SESSION_STORAGE_KEY_V3 = "resume-assistant-session-v3";
const LOCAL_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type WorkspaceModule = "resume" | "job" | "interview";
export type WorkspaceStage = "upload" | "analyzing" | "workspace";
export type TemplateId = "professional" | "minimal" | "compact";
export type PreviewMode = "original" | "locate" | "current" | "compare";

type Snapshot = Pick<
  AnalysisBundle,
  "resume" | "suggestions" | "scorecard" | "claims" | "evidence" | "stories"
>;

export type AppState = {
  stage: WorkspaceStage;
  module: WorkspaceModule;
  expiresAt: string | null;
  analysis: AnalysisBundle | null;
  jobMatch: JobMatchBundle | null;
  interviewPlan: InterviewPlan | null;
  interviewSessionVersion: number;
  evaluations: EvaluationResponse[];
  selectedSuggestionId: string | null;
  selectedTemplate: TemplateId;
  previewMode: PreviewMode;
  previewedRenderHashes: string[];
  renders: Partial<Record<TemplateId, RenderResponse>>;
  undoStack: Snapshot[];
  sourcePdfBlob: Blob | null;
  recentAnalyses: RecentAnalysisSummary[];
  recentAnalysesLoading: boolean;
  homeNavigationPending: boolean;
  error: string | null;
  setStage: (stage: WorkspaceStage) => void;
  setError: (error: string | null) => void;
  setModule: (module: WorkspaceModule) => void;
  setAnalysis: (analysis: AnalysisBundle, sourcePdfBlob?: Blob | null) => void;
  selectSuggestion: (id: string | null) => void;
  decideSuggestion: (
    id: string,
    status: SuggestionStatus,
    manualText?: string,
  ) => void;
  confirmClaim: (id: string, content?: string) => void;
  undo: () => void;
  setJobMatch: (jobMatch: JobMatchBundle) => void;
  setInterviewPlan: (plan: InterviewPlan) => void;
  addEvaluation: (evaluation: EvaluationResponse) => void;
  setTemplate: (template: TemplateId) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  markRenderPreviewed: (sha256: string) => void;
  setRender: (render: RenderResponse) => void;
  refreshRecentSessions: () => Promise<void>;
  enforceLocalExpiry: (now?: number) => Promise<void>;
  goHome: () => Promise<void>;
  goHomeWithoutArchive: () => void;
  openRecentSession: (id: string) => Promise<boolean>;
  deleteRecentSession: (id: string) => Promise<void>;
  clearAllLocalData: () => Promise<void>;
  attachOriginalPdf: (file: File) => Promise<void>;
  reset: () => void;
};

function emptySessionState(
  state: AppState,
  recentAnalyses = state.recentAnalyses,
) {
  return {
    stage: "upload" as const,
    module: "resume" as const,
    expiresAt: null,
    analysis: null,
    jobMatch: null,
    interviewPlan: null,
    interviewSessionVersion: state.interviewSessionVersion + 1,
    evaluations: [],
    selectedSuggestionId: null,
    selectedTemplate: "professional" as const,
    previewMode: "original" as const,
    previewedRenderHashes: [],
    renders: {},
    undoStack: [],
    sourcePdfBlob: null,
    recentAnalyses,
    recentAnalysesLoading: false,
    homeNavigationPending: false,
  };
}

function cancelWorkspaceActivity() {
  cancelAnalysisRequest();
  cancelAllClientRequests();
  disposeRegisteredClientRuntimeActivities();
}

function clearRuntimeResources() {
  cancelWorkspaceActivity();
  clearRegisteredClientCaches();
  revokeAllTrackedObjectUrls();
}

function clearPersistedSessionKeys() {
  try {
    useAppStore.persist.clearStorage();
  } catch {
    // The in-memory state is still cleared when browser storage is blocked.
  }
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY_V2);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY_V3);
    clearApiSessionId(window.sessionStorage);
  } catch {
    clearApiSessionId();
  }
  try {
    window.localStorage.removeItem("resume-assistant-session-v1");
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
}

function snapshot(analysis: AnalysisBundle): Snapshot {
  return {
    resume: structuredClone(analysis.resume),
    suggestions: structuredClone(analysis.suggestions),
    scorecard: structuredClone(analysis.scorecard),
    claims: structuredClone(analysis.claims),
    evidence: structuredClone(analysis.evidence),
    stories: structuredClone(analysis.stories),
  };
}

function storyForClaim(claim: Claim, current?: InterviewStory): InterviewStory {
  const parts = claimParts(claim.text);
  return {
    id: current?.id ?? stableId("story", claim.id),
    title: excerpt(claim.text, 32),
    situation: claim.subject ?? "待补充：当时的背景与约束",
    task: "待补充：你需要达成的具体目标",
    action: claim.action ?? parts.action,
    result: claim.result ?? "待补充：可核实的结果或影响",
    claimIds: current?.claimIds.includes(claim.id)
      ? current.claimIds
      : [claim.id],
    evidenceAssetIds: [
      ...new Set([
        ...(current?.evidenceAssetIds ?? []),
        ...claim.evidenceAssetIds,
      ]),
    ],
    keywords: extractKeywords(claim.text).slice(0, 10),
    riskNotes: [
      ...(claim.status === "needs_evidence"
        ? ["当前声明缺少证据，练习时不要补造细节。"]
        : []),
      ...(!claim.result ? ["结果尚不完整，回答前应补充真实信息。"] : []),
    ],
  };
}

function syncAcceptedUserClaims(
  analysis: AnalysisBundle,
  suggestion: Suggestion,
): Pick<AnalysisBundle, "claims" | "evidence" | "stories"> | null {
  const finalText = suggestion.proposedText?.trim() ?? "";
  if (!finalText) return null;

  const userStatementIds = new Set(
    analysis.evidence
      .filter(
        (asset) => asset.kind === "user_statement" && asset.verifiedByUser,
      )
      .map((asset) => asset.id),
  );
  const synchronizedClaimIds = new Set<string>();
  const claims = analysis.claims.map((claim) => {
    if (
      !suggestion.claimIds.includes(claim.id) ||
      !claim.evidenceAssetIds.some((evidenceId) =>
        userStatementIds.has(evidenceId),
      )
    ) {
      return claim;
    }
    const parts = claimParts(finalText);
    synchronizedClaimIds.add(claim.id);
    return {
      ...claim,
      text: finalText,
      subject: undefined,
      action: parts.action,
      method: parts.method,
      result: parts.result,
      status:
        claim.status === "supported"
          ? ("supported" as const)
          : ("user_confirmed" as const),
      confidence: Math.max(0.8, claim.confidence),
      missingInformation: parts.missingInformation,
    };
  });
  if (synchronizedClaimIds.size === 0) return null;

  const synchronizedEvidenceIds = new Set(
    claims
      .filter((claim) => synchronizedClaimIds.has(claim.id))
      .flatMap((claim) => claim.evidenceAssetIds)
      .filter((evidenceId) => userStatementIds.has(evidenceId)),
  );
  const evidence = analysis.evidence.map((asset) =>
    synchronizedEvidenceIds.has(asset.id)
      ? { ...asset, content: finalText }
      : asset,
  );
  const synchronizedClaims = new Map(
    claims
      .filter((claim) => synchronizedClaimIds.has(claim.id))
      .map((claim) => [claim.id, claim]),
  );
  const rebuiltStoryClaimIds = new Set<string>();
  const stories = analysis.stories.map((story) => {
    const claim = story.claimIds
      .map((claimId) => synchronizedClaims.get(claimId))
      .find(Boolean);
    if (!claim) return story;
    rebuiltStoryClaimIds.add(claim.id);
    return storyForClaim(claim, story);
  });
  for (const claim of synchronizedClaims.values()) {
    if (!rebuiltStoryClaimIds.has(claim.id)) stories.push(storyForClaim(claim));
  }
  return { claims, evidence, stories };
}

function confirmedReplacePatch(
  ast: ResumeAST,
  suggestion: Suggestion,
  value: string,
): SuggestionPatch[] | null {
  const matchingPaths: Array<{ path: string; sourceBlockIds: string[] }> = [];
  ast.sections.forEach((section, sectionIndex) => {
    section.entries.forEach((entry, entryIndex) => {
      entry.bullets.forEach((bullet, bulletIndex) => {
        if (bullet === suggestion.originalText) {
          matchingPaths.push({
            path: `/sections/${sectionIndex}/entries/${entryIndex}/bullets/${bulletIndex}`,
            sourceBlockIds: entry.sourceBlockIds,
          });
        }
      });
    });
  });
  const declaredPatch =
    suggestion.patches.length === 1 ? suggestion.patches[0] : undefined;
  const sourceIds = new Set(suggestion.sourceBlockIds);
  const declaredTarget = matchingPaths.find(
    (candidate) => candidate.path === declaredPatch?.path,
  );
  if (
    declaredPatch?.operation === "replace" &&
    declaredTarget &&
    (sourceIds.size === 0 ||
      declaredTarget.sourceBlockIds.some((id) => sourceIds.has(id)))
  ) {
    return [{ ...declaredPatch, value }];
  }

  const scoped = matchingPaths.filter(
    (candidate) =>
      sourceIds.size === 0 ||
      candidate.sourceBlockIds.some((id) => sourceIds.has(id)),
  );
  if (scoped.length !== 1) return null;
  return [{ operation: "replace", path: scoped[0].path, value }];
}

export function normalizePersistedSessionExpiry(
  expiresAt: unknown,
  analysis: AnalysisBundle | null | undefined,
  now = Date.now(),
): string | null {
  if (!analysis) return null;

  const declared =
    typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
  const createdAt = analysis.resume?.createdAt;
  const created =
    typeof createdAt === "string" ? Date.parse(createdAt) : Number.NaN;
  const trustedCreated =
    Number.isFinite(created) && created <= now ? created : null;

  if (Number.isFinite(declared)) {
    const maximum = (trustedCreated ?? now) + LOCAL_SESSION_TTL_MS;
    return new Date(Math.min(declared, maximum)).toISOString();
  }
  if (trustedCreated === null) return null;
  return new Date(trustedCreated + LOCAL_SESSION_TTL_MS).toISOString();
}

function sessionExpiry(analysis: AnalysisBundle) {
  return (
    normalizePersistedSessionExpiry(analysis.resume.expiresAt, analysis) ??
    new Date(Date.now() + LOCAL_SESSION_TTL_MS).toISOString()
  );
}

export function hasSessionExpired(
  expiresAt: string | null | undefined,
  now = Date.now(),
) {
  const expires = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  return !Number.isFinite(expires) || expires <= now;
}

export function isRenderForAnalysis(
  analysis: AnalysisBundle | null,
  render: RenderResponse,
) {
  return Boolean(
    analysis &&
    render.report.resumeId === analysis.resume.id &&
    render.report.resumeRevision === analysis.resume.revision &&
    render.report.template === render.template &&
    render.report.artifactSha256 === render.sha256,
  );
}

export function isJobMatchForAnalysis(
  analysis: AnalysisBundle | null,
  jobMatch: JobMatchBundle,
) {
  if (
    !analysis ||
    jobMatch.sourceResumeId !== analysis.resume.id ||
    jobMatch.sourceResumeRevision !== analysis.resume.revision
  ) {
    return false;
  }
  return Boolean(
    !jobMatch.variant ||
    (jobMatch.variant.baseResumeId === analysis.resume.id &&
      jobMatch.variant.baseRevision === analysis.resume.revision),
  );
}

export function isInterviewPlanForAnalysis(
  analysis: AnalysisBundle | null,
  plan: InterviewPlan,
) {
  return Boolean(
    analysis &&
    plan.sourceResumeId === analysis.resume.id &&
    plan.sourceResumeRevision === analysis.resume.revision,
  );
}

function isEvaluationForState(
  analysis: AnalysisBundle | null,
  plan: InterviewPlan | null,
  evaluation: EvaluationResponse,
) {
  return Boolean(
    analysis &&
    plan &&
    isInterviewPlanForAnalysis(analysis, plan) &&
    evaluation.sourceResumeId === analysis.resume.id &&
    evaluation.sourceResumeRevision === analysis.resume.revision &&
    plan.questions.some(
      (question) => question.id === evaluation.evaluation.questionId,
    ),
  );
}

function invalidatedDerivedState() {
  return {
    jobMatch: null,
    interviewPlan: null,
    evaluations: [],
    previewMode: "original" as const,
    previewedRenderHashes: [],
    renders: {},
  };
}

function normalizeEvaluation(
  evaluation: EvaluationResponse,
): EvaluationResponse {
  return {
    ...evaluation,
    consistencyWarnings: dedupeConsistencyWarnings(
      evaluation.consistencyWarnings,
    ),
  };
}

function evidenceGraphChanged(current: AnalysisBundle, previous: Snapshot) {
  return (
    JSON.stringify(current.claims) !== JSON.stringify(previous.claims) ||
    JSON.stringify(current.evidence) !== JSON.stringify(previous.evidence) ||
    JSON.stringify(current.stories) !== JSON.stringify(previous.stories)
  );
}

function nextScorecard(
  scorecard: Scorecard,
  suggestion: Suggestion,
  resumeRevision: number,
): Scorecard {
  const affected = new Set(suggestion.affectedDimensions);
  let budget = 2;
  const dimensions = scorecard.dimensions.map((dimension) => {
    if (
      !affected.has(dimension.id) ||
      budget <= 0 ||
      dimension.score >= dimension.maxScore
    )
      return dimension;
    const increase = Math.min(1, budget, dimension.maxScore - dimension.score);
    budget -= increase;
    return {
      ...dimension,
      score: dimension.score + increase,
      evidence: [...dimension.evidence, `已应用建议 ${suggestion.id}`],
    };
  });
  return {
    ...scorecard,
    resumeRevision,
    total: Math.min(
      100,
      dimensions.reduce((sum, dimension) => sum + dimension.score, 0),
    ),
    dimensions,
  };
}

type PersistedSessionState = Partial<AppState> & { history?: Snapshot[] };

export function migratePersistedSessionState(
  persistedState: unknown,
): PersistedSessionState {
  if (!persistedState || typeof persistedState !== "object") return {};
  const legacy = persistedState as PersistedSessionState;
  const { history, ...current } = legacy;
  return {
    ...current,
    expiresAt: normalizePersistedSessionExpiry(
      current.expiresAt,
      current.analysis,
    ),
    undoStack: Array.isArray(current.undoStack)
      ? current.undoStack
      : Array.isArray(history)
        ? history
        : [],
  };
}

export function mergePersistedSessionState(
  persistedState: unknown,
  currentState: AppState,
): AppState {
  const persisted = migratePersistedSessionState(persistedState);
  const undoStack = Array.isArray(persisted.undoStack)
    ? persisted.undoStack.slice(-20)
    : [];
  const merged = {
    ...currentState,
    ...persisted,
    undoStack,
    sourcePdfBlob: null,
    recentAnalyses: currentState.recentAnalyses,
    recentAnalysesLoading: false,
    homeNavigationPending: false,
  } as AppState;
  const jobMatch =
    merged.jobMatch && isJobMatchForAnalysis(merged.analysis, merged.jobMatch)
      ? merged.jobMatch
      : null;
  const interviewPlan =
    merged.interviewPlan &&
    isInterviewPlanForAnalysis(merged.analysis, merged.interviewPlan)
      ? merged.interviewPlan
      : null;
  const evaluations = interviewPlan
    ? merged.evaluations
        .filter((evaluation) =>
          isEvaluationForState(merged.analysis, interviewPlan, evaluation),
        )
        .map(normalizeEvaluation)
    : [];
  return { ...merged, jobMatch, interviewPlan, evaluations };
}

function migratingSessionStorage() {
  if (typeof window === "undefined")
    throw new Error("Session storage is only available in the browser.");
  const storage = window.sessionStorage;
  return {
    getItem: (name: string) => readMigratedSessionValue(storage, name),
    setItem: (name: string, value: string) => storage.setItem(name, value),
    removeItem: (name: string) => storage.removeItem(name),
  };
}

export function readMigratedSessionValue(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  name = SESSION_STORAGE_KEY_V3,
) {
  const current = storage.getItem(name);
  if (current !== null) {
    storage.removeItem(SESSION_STORAGE_KEY_V2);
    return current;
  }
  const legacy = storage.getItem(SESSION_STORAGE_KEY_V2);
  if (legacy !== null) {
    storage.setItem(name, legacy);
    storage.removeItem(SESSION_STORAGE_KEY_V2);
  }
  return legacy;
}

function recentPayload(state: AppState): RecentAnalysisPayload | null {
  if (!state.analysis) return null;
  return {
    analysis: state.analysis,
    jobMatch: state.jobMatch,
    interviewPlan: state.interviewPlan,
    evaluations: state.evaluations,
    module: state.module,
    selectedSuggestionId: state.selectedSuggestionId,
    selectedTemplate: state.selectedTemplate,
  };
}

async function saveCurrentSessionToRecent(): Promise<RecentAnalysisSummary[]> {
  const state = useAppStore.getState();
  const payload = recentPayload(state);
  if (!payload) return listRecentAnalyses();
  const input = {
    payload,
    expiresAt: state.expiresAt,
    pdfBlob: state.sourcePdfBlob,
  };
  return saveRecentAnalysis(input);
}

async function refreshCurrentSessionArchive(): Promise<
  RecentAnalysisSummary[]
> {
  const existing = await listRecentAnalyses();
  const state = useAppStore.getState();
  const recentAnalyses =
    state.analysis && !hasSessionExpired(state.expiresAt)
      ? await saveCurrentSessionToRecent()
      : existing;
  const current = useAppStore.getState();
  if (current.analysis && !current.analysis.originalPdfBase64) {
    const record = await getRecentAnalysis(current.analysis.resume.id);
    if (record?.pdfBlob) {
      const originalPdfBase64 = await blobToBase64(record.pdfBlob);
      const latest = useAppStore.getState();
      if (
        latest.analysis?.resume.id === record.id &&
        !latest.analysis.originalPdfBase64
      ) {
        useAppStore.setState({
          analysis: { ...latest.analysis, originalPdfBase64 },
          sourcePdfBlob: record.pdfBlob,
        });
      }
    }
  }
  return recentAnalyses;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      stage: "upload",
      module: "resume",
      expiresAt: null,
      analysis: null,
      jobMatch: null,
      interviewPlan: null,
      interviewSessionVersion: 0,
      evaluations: [],
      selectedSuggestionId: null,
      selectedTemplate: "professional",
      previewMode: "original",
      previewedRenderHashes: [],
      renders: {},
      undoStack: [],
      sourcePdfBlob: null,
      recentAnalyses: [],
      recentAnalysesLoading: false,
      homeNavigationPending: false,
      error: null,
      setStage: (stage) => set({ stage }),
      setError: (error) => set({ error }),
      setModule: (module) =>
        set((state) => (state.homeNavigationPending ? state : { module })),
      setAnalysis: (analysis, suppliedPdfBlob) => {
        const sourcePdfBlob =
          suppliedPdfBlob ??
          (analysis.originalPdfBase64
            ? base64ToPdfBlob(analysis.originalPdfBase64)
            : null);
        set((state) => ({
          ...invalidatedDerivedState(),
          analysis,
          sourcePdfBlob,
          interviewSessionVersion: state.interviewSessionVersion + 1,
          expiresAt: sessionExpiry(analysis),
          stage: "workspace",
          selectedSuggestionId:
            analysis.suggestions.find((item) => item.status === "pending")
              ?.id ?? null,
          undoStack: [],
          homeNavigationPending: false,
          error: null,
        }));
        void saveCurrentSessionToRecent().then(
          (recentAnalyses) => set({ recentAnalyses }),
          () => undefined,
        );
      },
      selectSuggestion: (selectedSuggestionId) =>
        set((state) =>
          state.homeNavigationPending ? state : { selectedSuggestionId },
        ),
      decideSuggestion: (id, status, manualText) =>
        set((state) => {
          if (!state.analysis || state.homeNavigationPending) return state;
          const current = state.analysis.suggestions.find(
            (item) => item.id === id,
          );
          if (!current || current.status !== "pending") return state;
          if (
            (current.kind === "needs_proof" || current.kind === "ask_user") &&
            status === "accepted"
          ) {
            return state;
          }
          const undoStack = [
            ...state.undoStack,
            snapshot(state.analysis),
          ].slice(-20);
          const updated = {
            ...current,
            status,
            proposedText: manualText ?? current.proposedText,
          };
          const shouldApply = status === "accepted" || status === "manual";
          const nextAst = shouldApply
            ? applySuggestion(state.analysis.resume.ast, updated)
            : state.analysis.resume.ast;
          const changed = nextAst !== state.analysis.resume.ast;
          const intentionalNoop =
            updated.kind === "use_as_is" ||
            (updated.kind !== "remove" &&
              updated.proposedText !== undefined &&
              updated.proposedText === updated.originalText);
          const decided =
            shouldApply && !changed && !intentionalNoop
              ? { ...updated, status: "stale" as const }
              : updated;
          const suggestions = state.analysis.suggestions.map((item) =>
            item.id === id ? decided : item,
          );
          const resume = changed
            ? {
                ...state.analysis.resume,
                revision: state.analysis.resume.revision + 1,
                ast: nextAst,
              }
            : state.analysis.resume;
          const scorecard = changed
            ? nextScorecard(state.analysis.scorecard, decided, resume.revision)
            : state.analysis.scorecard;
          const synchronizedGraph =
            shouldApply && decided.status !== "stale"
              ? syncAcceptedUserClaims(state.analysis, decided)
              : null;
          const selectedSuggestionId =
            suggestions.find((item) => item.status === "pending")?.id ?? id;
          return {
            analysis: {
              ...state.analysis,
              resume,
              suggestions,
              scorecard,
              ...(synchronizedGraph ?? {}),
            },
            selectedSuggestionId,
            undoStack,
            ...(changed || synchronizedGraph
              ? {
                  ...invalidatedDerivedState(),
                  interviewSessionVersion: state.interviewSessionVersion + 1,
                }
              : {}),
          };
        }),
      confirmClaim: (id, content) =>
        set((state) => {
          if (!state.analysis || state.homeNavigationPending) return state;
          const confirmedText = content?.trim();
          const originalClaim = state.analysis.claims.find(
            (claim) => claim.id === id,
          );
          if (!originalClaim || !confirmedText) return state;

          const patchesBySuggestion = new Map<string, SuggestionPatch[]>();
          state.analysis.suggestions.forEach((item) => {
            if (
              !item.claimIds.includes(id) ||
              (item.kind !== "needs_proof" && item.kind !== "ask_user")
            )
              return;
            const patches = confirmedReplacePatch(
              state.analysis!.resume.ast,
              item,
              confirmedText,
            );
            if (patches) patchesBySuggestion.set(item.id, patches);
          });
          if (patchesBySuggestion.size === 0) return state;

          const undoStack = [
            ...state.undoStack,
            snapshot(state.analysis),
          ].slice(-20);
          const evidenceId = `user-statement-${id}`;
          const userStatement: EvidenceAsset = {
            id: evidenceId,
            kind: "user_statement",
            label: "用户补充事实",
            content: confirmedText,
            sourceBlockIds: [],
            verifiedByUser: true,
            confidence: 0.9,
          };
          const claims: Claim[] = state.analysis.claims.map((claim) =>
            claim.id === id
              ? {
                  ...claim,
                  status:
                    claim.status === "supported"
                      ? "supported"
                      : "user_confirmed",
                  confidence: Math.max(0.8, claim.confidence),
                  evidenceAssetIds: [
                    ...new Set([...claim.evidenceAssetIds, evidenceId]),
                  ],
                }
              : claim,
          );
          const suggestions = state.analysis.suggestions.map((item) =>
            patchesBySuggestion.has(item.id)
              ? {
                  ...item,
                  kind: "rewrite" as const,
                  proposedText: confirmedText,
                  patches: patchesBySuggestion.get(item.id)!,
                  rationale: `${item.rationale} 已由用户补充事实，请再次核对后接受。`,
                }
              : item,
          );
          const evidence = [
            ...state.analysis.evidence.filter(
              (asset) => asset.id !== evidenceId,
            ),
            userStatement,
          ];
          return {
            analysis: { ...state.analysis, claims, suggestions, evidence },
            undoStack,
            ...invalidatedDerivedState(),
            interviewSessionVersion: state.interviewSessionVersion + 1,
          };
        }),
      undo: () =>
        set((state) => {
          if (
            !state.analysis ||
            state.undoStack.length === 0 ||
            state.homeNavigationPending
          )
            return state;
          const previous = state.undoStack[state.undoStack.length - 1];
          const invalidatesDerived =
            previous.resume.id !== state.analysis.resume.id ||
            previous.resume.revision !== state.analysis.resume.revision ||
            JSON.stringify(previous.resume.ast) !==
              JSON.stringify(state.analysis.resume.ast) ||
            evidenceGraphChanged(state.analysis, previous);
          return {
            analysis: { ...state.analysis, ...previous },
            undoStack: state.undoStack.slice(0, -1),
            ...(invalidatesDerived
              ? {
                  ...invalidatedDerivedState(),
                  interviewSessionVersion: state.interviewSessionVersion + 1,
                }
              : {}),
          };
        }),
      setJobMatch: (jobMatch) =>
        set((state) => {
          if (state.homeNavigationPending || state.stage !== "workspace")
            return state;
          if (!isJobMatchForAnalysis(state.analysis, jobMatch)) return state;
          return {
            jobMatch,
            interviewPlan: null,
            interviewSessionVersion: state.interviewSessionVersion + 1,
            evaluations: [],
          };
        }),
      setInterviewPlan: (interviewPlan) =>
        set((state) => {
          if (state.homeNavigationPending || state.stage !== "workspace")
            return state;
          if (!isInterviewPlanForAnalysis(state.analysis, interviewPlan))
            return state;
          return {
            interviewPlan,
            interviewSessionVersion: state.interviewSessionVersion + 1,
            evaluations: [],
          };
        }),
      addEvaluation: (evaluation) =>
        set((state) => {
          if (state.homeNavigationPending || state.stage !== "workspace")
            return state;
          if (
            !isEvaluationForState(
              state.analysis,
              state.interviewPlan,
              evaluation,
            )
          )
            return state;
          const questionId = evaluation.evaluation.questionId;
          if (
            state.evaluations.some(
              (item) => item.evaluation.questionId === questionId,
            )
          )
            return state;
          return {
            evaluations: [
              ...state.evaluations,
              normalizeEvaluation(evaluation),
            ],
          };
        }),
      setTemplate: (selectedTemplate) =>
        set((state) =>
          state.homeNavigationPending ? state : { selectedTemplate },
        ),
      setPreviewMode: (previewMode) =>
        set((state) => (state.homeNavigationPending ? state : { previewMode })),
      markRenderPreviewed: (sha256) =>
        set((state) => {
          if (state.homeNavigationPending) return state;
          const isCurrent = Object.values(state.renders).some(
            (render) =>
              render?.sha256 === sha256 &&
              isRenderForAnalysis(state.analysis, render),
          );
          if (!isCurrent || state.previewedRenderHashes.includes(sha256))
            return state;
          return {
            previewedRenderHashes: [...state.previewedRenderHashes, sha256],
          };
        }),
      setRender: (render) =>
        set((state) => {
          if (state.homeNavigationPending || state.stage !== "workspace")
            return state;
          if (!isRenderForAnalysis(state.analysis, render)) return state;
          return {
            renders: { ...state.renders, [render.template]: render },
            previewMode: state.analysis?.originalPdfBase64
              ? "compare"
              : "current",
          };
        }),
      refreshRecentSessions: async () => {
        set({ recentAnalysesLoading: true });
        try {
          const recentAnalyses = await refreshCurrentSessionArchive();
          set({ recentAnalyses, recentAnalysesLoading: false });
        } catch (error) {
          set({
            recentAnalysesLoading: false,
            error:
              error instanceof Error ? error.message : "无法读取本机最近记录。",
          });
        }
      },
      enforceLocalExpiry: async (now = Date.now()) => {
        const state = get();
        const currentExpired = Boolean(
          state.analysis && hasSessionExpired(state.expiresAt, now),
        );
        const summariesExpired = state.recentAnalyses.some((record) =>
          hasSessionExpired(record.expiresAt, now),
        );
        if (!currentExpired && !summariesExpired) return;

        if (currentExpired) {
          clearRuntimeResources();
          const currentId = state.analysis?.resume.id;
          set((current) => ({
            ...emptySessionState(current),
            error: null,
          }));
          try {
            const recentAnalyses = currentId
              ? await deleteRecentAnalysis(currentId, now)
              : await listRecentAnalyses(now);
            set({ recentAnalyses });
          } catch {
            set({
              error:
                "当前会话已过期并从页面清除；浏览器存储恢复后会继续清理本机记录。",
            });
          }
          return;
        }

        try {
          set({ recentAnalyses: await listRecentAnalyses(now) });
        } catch {
          set({ error: "过期记录暂时无法从浏览器存储中清理。" });
        }
      },
      goHome: async () => {
        if (get().homeNavigationPending) return;
        cancelWorkspaceActivity();
        set({ homeNavigationPending: true, error: null });
        try {
          const recentAnalyses = await saveCurrentSessionToRecent();
          set({
            stage: "upload",
            recentAnalyses,
            homeNavigationPending: false,
            error: null,
          });
        } catch (error) {
          set({
            homeNavigationPending: false,
            error:
              error instanceof Error
                ? `无法安全保存当前会话：${error.message}`
                : "无法安全保存当前会话，请重试。",
          });
        }
      },
      goHomeWithoutArchive: () => {
        cancelWorkspaceActivity();
        set({
          stage: "upload",
          homeNavigationPending: false,
          error: null,
        });
      },
      openRecentSession: async (id) => {
        const record = await getRecentAnalysis(id);
        if (!record) {
          const recentAnalyses = await listRecentAnalyses();
          set({ recentAnalyses, error: "这条记录已过期或不存在。" });
          return false;
        }

        let originalPdfBase64: string | undefined;
        if (record.pdfBlob) {
          try {
            originalPdfBase64 = await blobToBase64(record.pdfBlob);
          } catch {
            originalPdfBase64 = undefined;
          }
        }
        const parsedAnalysis = AnalysisBundleSchema.safeParse({
          ...record.payload.analysis,
          pagePreviews: [],
          originalPdfBase64,
        });
        if (!parsedAnalysis.success) {
          const recentAnalyses = await deleteRecentAnalysis(id);
          set({
            recentAnalyses,
            error: "这条记录已损坏，已从本机记录中移除。",
          });
          return false;
        }

        const analysis = parsedAnalysis.data;
        const parsedJobMatch = record.payload.jobMatch
          ? JobMatchBundleSchema.safeParse(record.payload.jobMatch)
          : null;
        const jobMatch =
          parsedJobMatch?.success &&
          isJobMatchForAnalysis(analysis, parsedJobMatch.data)
            ? parsedJobMatch.data
            : null;
        const parsedInterviewPlan = record.payload.interviewPlan
          ? InterviewPlanSchema.safeParse(record.payload.interviewPlan)
          : null;
        const interviewPlan =
          parsedInterviewPlan?.success &&
          isInterviewPlanForAnalysis(analysis, parsedInterviewPlan.data)
            ? parsedInterviewPlan.data
            : null;
        const evaluations = interviewPlan
          ? record.payload.evaluations
              .map((evaluation) =>
                EvaluationResponseSchema.safeParse(evaluation),
              )
              .filter((result) => result.success)
              .map((result) => normalizeEvaluation(result.data))
              .filter((evaluation) =>
                isEvaluationForState(analysis, interviewPlan, evaluation),
              )
          : [];
        const restoredModule = ["resume", "job", "interview"].includes(
          record.payload.module,
        )
          ? record.payload.module
          : "resume";
        const selectedSuggestionId = analysis.suggestions.some(
          (suggestion) => suggestion.id === record.payload.selectedSuggestionId,
        )
          ? record.payload.selectedSuggestionId
          : (analysis.suggestions.find(
              (suggestion) => suggestion.status === "pending",
            )?.id ?? null);

        set((state) => ({
          stage: "workspace",
          module: restoredModule,
          expiresAt: record.expiresAt,
          analysis,
          jobMatch,
          interviewPlan,
          interviewSessionVersion: state.interviewSessionVersion + 1,
          evaluations,
          selectedSuggestionId,
          selectedTemplate: record.payload.selectedTemplate,
          previewMode: "original",
          previewedRenderHashes: [],
          renders: {},
          undoStack: [],
          sourcePdfBlob: record.pdfBlob ?? null,
          homeNavigationPending: false,
          error: null,
        }));
        return true;
      },
      deleteRecentSession: async (id) => {
        if (get().analysis?.resume.id === id) clearRuntimeResources();
        const recentAnalyses = await deleteRecentAnalysis(id);
        set((state) =>
          state.analysis?.resume.id === id
            ? {
                stage: "upload",
                module: "resume",
                expiresAt: null,
                analysis: null,
                jobMatch: null,
                interviewPlan: null,
                interviewSessionVersion: state.interviewSessionVersion + 1,
                evaluations: [],
                selectedSuggestionId: null,
                selectedTemplate: "professional",
                previewMode: "original",
                previewedRenderHashes: [],
                renders: {},
                undoStack: [],
                sourcePdfBlob: null,
                recentAnalyses,
                homeNavigationPending: false,
                error: null,
              }
            : { recentAnalyses },
        );
      },
      clearAllLocalData: async () => {
        clearRuntimeResources();
        let storageError: unknown;
        try {
          await clearRecentAnalyses();
        } catch (error) {
          storageError = error;
        }
        set((state) => ({
          ...emptySessionState(state, []),
          error: storageError
            ? "页面内数据已清除，但浏览器存储删除失败，请关闭页面后重试。"
            : null,
        }));
        clearPersistedSessionKeys();
        if (storageError)
          throw storageError instanceof Error
            ? storageError
            : new Error("浏览器存储删除失败。");
      },
      attachOriginalPdf: async (file) => {
        const state = useAppStore.getState();
        if (!state.analysis) throw new Error("当前没有可恢复的分析记录。");
        const isPdf =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) throw new Error("请选择 PDF 文件。");
        if (file.size > 10 * 1024 * 1024)
          throw new Error("文件超过 10 MB，请压缩后重试。");
        if (file.name !== state.analysis.resume.originalFileName) {
          throw new Error(
            `请选择原文件：${state.analysis.resume.originalFileName}`,
          );
        }
        if ((await file.slice(0, 5).text()) !== "%PDF-") {
          throw new Error("文件内容不是有效的 PDF。");
        }
        const archivedRecord = await getRecentAnalysis(
          state.analysis.resume.id,
        );
        if (!archivedRecord?.pdfSha256) {
          throw new Error(
            "这条旧记录没有原文件校验信息，请重新分析原 PDF，不能直接替换原版预览。",
          );
        }
        const fileSha256 = await sha256Blob(file);
        if (fileSha256 !== archivedRecord.pdfSha256) {
          throw new Error("所选 PDF 与分析时的原文件不一致。");
        }
        const originalPdfBase64 = await blobToBase64(file);
        const latest = useAppStore.getState();
        if (latest.analysis?.resume.id !== state.analysis.resume.id) {
          throw new Error("当前分析记录已切换，请重新选择原 PDF。");
        }
        set({
          analysis: { ...latest.analysis, originalPdfBase64 },
          sourcePdfBlob: file,
          previewMode: "original",
          error: null,
        });
        const recentAnalyses = await saveCurrentSessionToRecent();
        set({ recentAnalyses });
      },
      reset: () =>
        set((state) => ({
          ...emptySessionState(state),
          error: null,
        })),
    }),
    {
      name: SESSION_STORAGE_KEY_V3,
      version: 3,
      storage: createJSONStorage(migratingSessionStorage),
      migrate: (persistedState) => migratePersistedSessionState(persistedState),
      partialize: (state) => ({
        stage: state.analysis ? state.stage : "upload",
        module: state.module,
        expiresAt: state.expiresAt,
        analysis: state.analysis
          ? {
              ...state.analysis,
              pagePreviews: [],
              originalPdfBase64: undefined,
            }
          : null,
        jobMatch: state.jobMatch,
        interviewPlan: state.interviewPlan,
        evaluations: state.evaluations,
        selectedSuggestionId: state.selectedSuggestionId,
        selectedTemplate: state.selectedTemplate,
        undoStack: state.undoStack,
      }),
      merge: mergePersistedSessionState,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.analysis && hasSessionExpired(state.expiresAt)) {
          state.reset();
          return;
        }
        if (state.analysis) {
          queueMicrotask(() => {
            void useAppStore.getState().refreshRecentSessions();
          });
        }
      },
    },
  ),
);

export function handleRecentAnalysisInvalidation(
  event: RecentAnalysisInvalidation,
) {
  const state = useAppStore.getState();
  if (event.kind === "clear") {
    clearRuntimeResources();
    useAppStore.setState({
      ...emptySessionState(state, []),
      error: "本机记录已在另一个标签页中清空。",
    });
    clearPersistedSessionKeys();
    return;
  }

  if (
    event.kind === "generation" ||
    (event.kind === "delete" && event.recordId === state.analysis?.resume.id)
  ) {
    cancelWorkspaceActivity();
    useAppStore.setState({
      ...emptySessionState(
        state,
        state.recentAnalyses.filter((record) => record.id !== event.recordId),
      ),
      error:
        event.kind === "delete"
          ? "当前记录已在另一个标签页中删除。"
          : "本机记录已在另一个标签页中更新，请重新打开需要的记录。",
    });
    return;
  }

  if (event.recordId) {
    useAppStore.setState({
      recentAnalyses: state.recentAnalyses.filter(
        (record) => record.id !== event.recordId,
      ),
    });
  }
}
