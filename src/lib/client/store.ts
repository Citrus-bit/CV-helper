"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  AnalysisBundleSchema,
  EvaluationResponseSchema,
  InterviewProgressSchema,
  InterviewPlanSchema,
  JobDraftSchema,
  JobMatchBundleSchema,
  RenderResponseSchema,
  dedupeConsistencyWarnings,
  type AnalysisBundle,
  type EvaluationResponse,
  type InterviewProgress,
  type InterviewPlan,
  type InterviewSetupStage,
  type JobDraft,
  type JobMatchBundle,
  type RenderResponse,
} from "./contracts";
import type {
  Claim,
  EvidenceAsset,
  InterviewStory,
  Suggestion,
  SuggestionPatch,
  SuggestionStatus,
} from "@/lib/domain";
import {
  ResumeASTSchema,
  type ResumeAST,
  type ResumeTemplateId,
} from "@/lib/domain";
import {
  claimParts,
  excerpt,
  extractKeywords,
  normalizeText,
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
import {
  hasFreshRequiredAiAnalysis,
  hasRequiredAiProvenance,
} from "./ai-analysis";
import { applySuggestion, suggestionBeforeHashMatches } from "./resume";
import {
  ensureSuggestionScoreGains,
  safeAiRewriteSuggestions,
} from "./suggestions";
import { clearApiSessionId } from "./privacy";
import { reanalyzeResumeRevision } from "@/lib/resume-reanalysis";
import {
  cancelAllClientRequests,
  clearRegisteredClientCaches,
  disposeRegisteredClientRuntimeActivities,
  revokeAllTrackedObjectUrls,
} from "./runtime-resources";
import {
  RESUME_CHAT_CONTEXT_WINDOW,
  RESUME_CHAT_MAX_MESSAGES,
  ResumeChatContextSchema,
  ResumeChatInputSchema,
  emptyResumeChatContext,
  normalizeResumeChatContext,
  resumeChatConfirmedFacts,
  type ResumeChatContext,
  type ResumeChatInput,
  type ResumeChatMessage,
  type ResumeChatResponse,
} from "@/lib/resume-chat";

export const SESSION_STORAGE_KEY_V2 = "resume-assistant-session-v2";
export const SESSION_STORAGE_KEY_V3 = "resume-assistant-session-v3";
const LOCAL_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

let activeRevisionAnalysis:
  | { resumeId: string; revision: number; controller: AbortController }
  | null = null;

export type WorkspaceModule = "resume" | "job" | "interview";
type WorkspaceStage = "upload" | "analyzing" | "workspace";
export type TemplateId = ResumeTemplateId;
type PreviewMode = "original" | "current";
export type ResumePanel = "suggestions" | "chat" | "templates";
type InterviewProgressUpdate = Partial<
  Pick<
    InterviewProgress,
    | "questionIndex"
    | "followUpRound"
    | "askedFollowUps"
    | "followUpEvaluation"
    | "transcript"
    | "transcriptSource"
  >
>;

type LegacySnapshot = Pick<
  AnalysisBundle,
  "resume" | "suggestions" | "scorecard" | "claims" | "evidence" | "stories"
>;
type PersistedSnapshot = Omit<
  AnalysisBundle,
  "originalPdfBase64"
>;
type Snapshot = AnalysisBundle | PersistedSnapshot | LegacySnapshot;

export type AppState = {
  stage: WorkspaceStage;
  module: WorkspaceModule;
  expiresAt: string | null;
  analysis: AnalysisBundle | null;
  jobDraft: JobDraft;
  jobMatch: JobMatchBundle | null;
  interviewPlan: InterviewPlan | null;
  interviewSessionVersion: number;
  evaluations: EvaluationResponse[];
  interviewSetupStage: InterviewSetupStage;
  interviewProgress: InterviewProgress | null;
  resumeChat: ResumeChatContext | null;
  selectedSuggestionId: string | null;
  activeResumeVariantId: string | null;
  resumePanel: ResumePanel;
  selectedTemplate: TemplateId;
  previewMode: PreviewMode;
  previewedRenderHashes: string[];
  renders: Partial<Record<TemplateId, RenderResponse>>;
  undoStack: Snapshot[];
  sourcePdfBlob: Blob | null;
  recentAnalyses: RecentAnalysisSummary[];
  recentAnalysesLoading: boolean;
  homeNavigationPending: boolean;
  archiveSuppressedForResumeId: string | null;
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
  replaceAiSuggestions: (
    suggestions: Suggestion[],
    sourceVersion: string,
  ) => void;
  applyAiSuggestions: () => number;
  applyManualResumeAst: (ast: ResumeAST, changeSummary?: string) => number | null;
  retryAiAnalysis: () => void;
  beginResumeChatTurn: (content: string) => ResumeChatMessage | null;
  completeResumeChatTurn: (
    userMessageId: string,
    response: ResumeChatResponse,
  ) => boolean;
  clearResumeChat: () => void;
  confirmClaim: (id: string, content?: string) => void;
  stageEvidenceRewrite: (
    suggestionId: string,
    supplementalFacts: string,
    rewrittenText: string,
    sourceVersion: string,
  ) => boolean;
  undo: () => void;
  updateJobDraft: (update: Partial<JobDraft>) => void;
  setJobMatch: (jobMatch: JobMatchBundle) => void;
  setResumeVariant: (variantId: string | null) => void;
  setResumePanel: (panel: ResumePanel) => void;
  setInterviewPlan: (plan: InterviewPlan) => void;
  addEvaluation: (evaluation: EvaluationResponse) => void;
  setInterviewSetupStage: (stage: InterviewSetupStage) => void;
  updateInterviewProgress: (update: InterviewProgressUpdate) => void;
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

function defaultJobDraft(locale?: string): JobDraft {
  return {
    jdText: "",
    jobTitle: "",
    seniority: "",
    location: "",
    language: locale?.toLowerCase().startsWith("en") ? "en-US" : "zh-CN",
  };
}

function resumeChatMessageId(role: ResumeChatMessage["role"]) {
  const unique =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `resume-chat-${role}-${unique}`;
}

export function resumeChatInputForMessage(
  analysis: AnalysisBundle,
  context: ResumeChatContext,
  userMessageId: string,
): ResumeChatInput {
  const messageIndex = context.messages.findIndex(
    (message) => message.id === userMessageId && message.role === "user",
  );
  if (messageIndex < 0) {
    throw new Error("无法读取本轮对话，请重新输入。");
  }
  const userMessage = context.messages[messageIndex];
  const recentMessages = context.messages
    .slice(0, messageIndex)
    .slice(-RESUME_CHAT_CONTEXT_WINDOW)
    .map(({ role, content, resumeRevision }) => ({
      role,
      content,
      resumeRevision,
    }));
  return ResumeChatInputSchema.parse({
    resume: analysis.resume,
    claims: analysis.claims,
    summary: context.summary,
    confirmedFacts: resumeChatConfirmedFacts(context, analysis.claims),
    recentChanges: context.recentChanges,
    recentMessages,
    userMessage: userMessage.content,
  });
}

function resumeChatAfterRevision(
  context: ResumeChatContext | null,
  analysis: AnalysisBundle,
  change: string,
): ResumeChatContext {
  const current = normalizeResumeChatContext(
    context,
    analysis.resume.id,
    analysis.resume.revision,
  );
  return {
    ...current,
    sourceResumeRevision: analysis.resume.revision,
    confirmedFacts: resumeChatConfirmedFacts(current, analysis.claims),
    recentChanges: [...current.recentChanges, change.trim()]
      .filter(Boolean)
      .slice(-50),
  };
}

function emptySessionState(
  state: AppState,
  recentAnalyses = state.recentAnalyses,
) {
  return {
    stage: "upload" as const,
    module: "resume" as const,
    expiresAt: null,
    analysis: null,
    jobDraft: defaultJobDraft(),
    jobMatch: null,
    interviewPlan: null,
    interviewSessionVersion: state.interviewSessionVersion + 1,
    evaluations: [],
    interviewSetupStage: "intro" as const,
    interviewProgress: null,
    resumeChat: null,
    selectedSuggestionId: null,
    activeResumeVariantId: null,
    resumePanel: "suggestions" as const,
    selectedTemplate: "professional" as const,
    previewMode: "original" as const,
    previewedRenderHashes: [],
    renders: {},
    undoStack: [],
    sourcePdfBlob: null,
    recentAnalyses,
    recentAnalysesLoading: false,
    homeNavigationPending: false,
    archiveSuppressedForResumeId: null,
  };
}

function cancelWorkspaceActivity() {
  cancelScheduledSessionArchive();
  cancelAnalysisRequest();
  activeRevisionAnalysis?.controller.abort();
  activeRevisionAnalysis = null;
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
  return structuredClone(analysis);
}

function rebindPendingSuggestion(
  suggestion: Suggestion,
  ast: ResumeAST,
  resumeRevision: number,
): Suggestion {
  const rebound = { ...suggestion, resumeRevision };
  return suggestionBeforeHashMatches(ast, rebound)
    ? rebound
    : { ...suggestion, status: "stale" };
}

function reviewedSuggestionPaths(suggestions: readonly Suggestion[]) {
  return new Set(
    suggestions
      .filter(
        (suggestion) =>
          suggestion.status === "accepted" ||
          suggestion.status === "manual" ||
          suggestion.status === "rejected",
      )
      .flatMap((suggestion) => suggestion.patches.map((patch) => patch.path)),
  );
}

function processingAfterLocalRevision(
  analysis: AnalysisBundle,
  localVersions: Record<string, string>,
) {
  const previousAi = analysis.processing.aiAnalysis;
  return {
    ...analysis.processing,
    capabilityVersions: {
      ...analysis.processing.capabilityVersions,
      ...localVersions,
    },
    aiAnalysis: {
      status: "stale" as const,
      analyzedRevision:
        previousAi?.analyzedRevision ?? analysis.scorecard.resumeRevision,
      scoreSourceVersion:
        previousAi?.scoreSourceVersion ??
        analysis.processing.capabilityVersions["resume.score"] ??
        analysis.scorecard.sourceVersion ??
        "legacy.resume.score@0.0.0",
      suggestionSourceVersion:
        previousAi?.suggestionSourceVersion ??
        analysis.processing.capabilityVersions["resume.suggest"] ??
        "legacy.resume.suggest@0.0.0",
    },
  };
}

function persistedSnapshot(snapshotValue: Snapshot): Snapshot {
  const projected = structuredClone(snapshotValue);
  if ("originalPdfBase64" in projected)
    delete (projected as Partial<AnalysisBundle>).originalPdfBase64;
  return projected as PersistedSnapshot;
}

function restoreSnapshot(
  current: AnalysisBundle,
  previous: Snapshot,
): AnalysisBundle {
  return { ...current, ...structuredClone(previous) };
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

type ActiveResumeTarget = {
  kind: "base" | "job_variant";
  id: string;
  revision: number;
  name: string;
  ast: ResumeAST;
};

function getActiveResumeTarget(
  state: Pick<AppState, "analysis" | "jobMatch" | "activeResumeVariantId">,
): ActiveResumeTarget | null {
  if (!state.analysis) return null;
  const variant = state.jobMatch?.variant;
  if (
    variant &&
    state.activeResumeVariantId === variant.id &&
    variant.baseResumeId === state.analysis.resume.id &&
    variant.baseRevision === state.analysis.resume.revision
  ) {
    return {
      kind: "job_variant",
      id: variant.id,
      revision: variant.revision,
      name: variant.name,
      ast: variant.ast,
    };
  }
  return {
    kind: "base",
    id: state.analysis.resume.id,
    revision: state.analysis.resume.revision,
    name: "通用版",
    ast: state.analysis.resume.ast,
  };
}

function isRenderForActiveResume(
  state: Pick<AppState, "analysis" | "jobMatch" | "activeResumeVariantId">,
  render: RenderResponse,
) {
  const target = getActiveResumeTarget(state);
  return Boolean(
    target &&
    render.report.resumeId === target.id &&
    render.report.resumeRevision === target.revision &&
    render.report.template === render.template &&
    render.report.artifactSha256 === render.sha256,
  );
}

function isJobMatchForAnalysis(
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
      jobMatch.variant.baseRevision === analysis.resume.revision &&
      (jobMatch.variant.changes.length > 0 ||
        jobMatch.variant.appliedSuggestionIds.length > 0) &&
      JSON.stringify(jobMatch.variant.ast) !==
        JSON.stringify(analysis.resume.ast)),
  );
}

function isInterviewPlanForAnalysis(
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

function interviewPlanFingerprint(plan: InterviewPlan) {
  return stableId("interview_plan", JSON.stringify(plan));
}

export function interviewFollowUpQuestionId(questionId: string, round: number) {
  const suffix = `::follow-up:${round}`;
  return `${questionId.slice(0, 200 - suffix.length)}${suffix}`;
}

function defaultInterviewQuestionIndex(
  plan: InterviewPlan,
  evaluations: readonly EvaluationResponse[],
) {
  const maxFollowUps = Math.min(plan.maxFollowUps, 2);
  for (let index = 0; index < plan.questions.length; index += 1) {
    const question = plan.questions[index];
    const evaluation = evaluations.find(
      (item) => item.evaluation.questionId === question.id,
    );
    if (!evaluation) return index;
    const hasPendingFollowUp =
      maxFollowUps > 0 &&
      Boolean(
        evaluation.evaluation.followUpQuestion?.trim() ||
        question.followUps.some((candidate) => candidate.trim()),
      );
    if (hasPendingFollowUp) return index;
  }
  return plan.questions.length;
}

function newInterviewProgress(
  analysis: AnalysisBundle,
  plan: InterviewPlan,
  evaluations: readonly EvaluationResponse[],
): InterviewProgress {
  return {
    schemaVersion: 1,
    sourceResumeId: analysis.resume.id,
    sourceResumeRevision: analysis.resume.revision,
    planFingerprint: interviewPlanFingerprint(plan),
    questionIndex: defaultInterviewQuestionIndex(plan, evaluations),
    followUpRound: 0,
    askedFollowUps: [],
    followUpEvaluation: null,
    transcript: "",
    transcriptSource: "text",
  };
}

function normalizeInterviewProgress(
  analysis: AnalysisBundle | null,
  plan: InterviewPlan | null,
  evaluations: readonly EvaluationResponse[],
  value: unknown,
): InterviewProgress | null {
  if (!analysis || !plan || !isInterviewPlanForAnalysis(analysis, plan))
    return null;
  const fallback = newInterviewProgress(analysis, plan, evaluations);
  const parsed = InterviewProgressSchema.safeParse(value);
  if (!parsed.success) return fallback;
  const progress = parsed.data;
  if (
    progress.sourceResumeId !== analysis.resume.id ||
    progress.sourceResumeRevision !== analysis.resume.revision ||
    progress.planFingerprint !== interviewPlanFingerprint(plan) ||
    progress.questionIndex > plan.questions.length
  ) {
    return fallback;
  }
  if (progress.followUpRound === 0) {
    if (
      progress.askedFollowUps.length > 0 ||
      progress.followUpEvaluation !== null
    ) {
      return fallback;
    }
    return progress;
  }
  const question = plan.questions[progress.questionIndex];
  if (
    !question ||
    progress.followUpRound > Math.min(plan.maxFollowUps, 2) ||
    progress.askedFollowUps.length !== progress.followUpRound ||
    new Set(progress.askedFollowUps).size !== progress.askedFollowUps.length ||
    !evaluations.some(
      (evaluation) => evaluation.evaluation.questionId === question.id,
    )
  ) {
    return fallback;
  }
  const followUpEvaluation = progress.followUpEvaluation;
  if (
    followUpEvaluation &&
    (followUpEvaluation.sourceResumeId !== analysis.resume.id ||
      followUpEvaluation.sourceResumeRevision !== analysis.resume.revision ||
      followUpEvaluation.evaluation.questionId !==
        interviewFollowUpQuestionId(question.id, progress.followUpRound))
  ) {
    return fallback;
  }
  return progress;
}

function normalizeInterviewSetupStage(value: unknown): InterviewSetupStage {
  return value === "device_check" ? "device_check" : "intro";
}

function seniorityDraftValue(value: string | undefined): JobDraft["seniority"] {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return "";
  if (/(intern|internship|实习)/u.test(normalized)) return "intern";
  if (/(entry|junior|初级|应届)/u.test(normalized)) return "entry";
  if (/(mid|middle|中级)/u.test(normalized)) return "mid";
  if (/(senior|高级|资深)/u.test(normalized)) return "senior";
  if (/(lead|head|负责人|专家)/u.test(normalized)) return "lead";
  if (/(executive|director|vp|总监|高管)/u.test(normalized)) return "executive";
  return "";
}

function normalizeJobDraft(
  value: unknown,
  analysis: AnalysisBundle | null,
  jobMatch: JobMatchBundle | null,
): JobDraft {
  const parsed = JobDraftSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const fallback = defaultJobDraft(
    jobMatch?.job.locale ??
      analysis?.resume.locale ??
      analysis?.resume.ast.locale,
  );
  return {
    ...fallback,
    jdText: jobMatch?.job.rawText ?? "",
    jobTitle: jobMatch?.job.title ?? "",
    seniority: seniorityDraftValue(jobMatch?.job.seniority),
    location: jobMatch?.job.location ?? "",
  };
}

function invalidatedDerivedState(
  resumePanel: ResumePanel = "suggestions",
) {
  return {
    jobMatch: null,
    activeResumeVariantId: null,
    resumePanel,
    interviewPlan: null,
    evaluations: [],
    interviewSetupStage: "intro" as const,
    interviewProgress: null,
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

type PersistedSessionState = Partial<AppState> & { history?: Snapshot[] };

export function migratePersistedSessionState(
  persistedState: unknown,
): PersistedSessionState {
  if (!persistedState || typeof persistedState !== "object") return {};
  const legacy = persistedState as PersistedSessionState;
  const { history, ...current } = legacy;
  const undoStack = Array.isArray(current.undoStack)
    ? current.undoStack
    : Array.isArray(history)
      ? history
      : [];
  return {
    ...current,
    expiresAt: normalizePersistedSessionExpiry(
      current.expiresAt,
      current.analysis,
    ),
    undoStack: undoStack.slice(-20).map(persistedSnapshot),
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
  if (merged.analysis) {
    const suggestions = ensureSuggestionScoreGains(
      merged.analysis.suggestions,
      merged.analysis.scorecard.total,
    );
    if (suggestions !== merged.analysis.suggestions) {
      merged.analysis = { ...merged.analysis, suggestions };
    }
  }
  const parsedJobMatch = merged.jobMatch
    ? JobMatchBundleSchema.safeParse(merged.jobMatch)
    : null;
  const jobMatch =
    parsedJobMatch?.success &&
    isJobMatchForAnalysis(merged.analysis, parsedJobMatch.data)
      ? parsedJobMatch.data
      : null;
  const activeResumeVariantId =
    jobMatch?.variant?.id === merged.activeResumeVariantId
      ? merged.activeResumeVariantId
      : null;
  const resumePanel =
    merged.resumePanel === "templates" ||
    merged.resumePanel === "suggestions" ||
    merged.resumePanel === "chat"
      ? merged.resumePanel
      : "suggestions";
  const parsedInterviewPlan = merged.interviewPlan
    ? InterviewPlanSchema.safeParse(merged.interviewPlan)
    : null;
  const interviewPlan =
    parsedInterviewPlan?.success &&
    isInterviewPlanForAnalysis(merged.analysis, parsedInterviewPlan.data)
      ? parsedInterviewPlan.data
      : null;
  const evaluations = interviewPlan
    ? (Array.isArray(merged.evaluations) ? merged.evaluations : [])
        .map((evaluation) => EvaluationResponseSchema.safeParse(evaluation))
        .filter((result) => result.success)
        .map((result) => result.data)
        .filter((evaluation) =>
          isEvaluationForState(merged.analysis, interviewPlan, evaluation),
        )
        .map(normalizeEvaluation)
    : [];
  const interviewProgress = normalizeInterviewProgress(
    merged.analysis,
    interviewPlan,
    evaluations,
    merged.interviewProgress,
  );
  const archiveSuppressedForResumeId =
    merged.archiveSuppressedForResumeId === merged.analysis?.resume.id
      ? merged.archiveSuppressedForResumeId
      : null;
  const jobDraft = normalizeJobDraft(
    merged.jobDraft,
    merged.analysis,
    jobMatch,
  );
  const resumeChat = merged.analysis
    ? normalizeResumeChatContext(
        merged.resumeChat,
        merged.analysis.resume.id,
        merged.analysis.resume.revision,
      )
    : null;
  const requestedModule = ["resume", "job", "interview"].includes(merged.module)
    ? merged.module
    : "resume";
  const restoredModule =
    merged.analysis && !hasFreshRequiredAiAnalysis(merged.analysis)
      ? "resume"
      : requestedModule;
  const legacyAnalysis = Boolean(
    merged.analysis && !hasRequiredAiProvenance(merged.analysis),
  );
  return {
    ...merged,
    stage: legacyAnalysis ? "upload" : merged.stage,
    module: legacyAnalysis ? "resume" : restoredModule,
    jobDraft,
    jobMatch,
    activeResumeVariantId,
    resumePanel,
    interviewPlan,
    evaluations,
    interviewSetupStage: normalizeInterviewSetupStage(
      merged.interviewSetupStage,
    ),
    interviewProgress,
    resumeChat,
    archiveSuppressedForResumeId,
  };
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
  if (!state.analysis || !hasFreshRequiredAiAnalysis(state.analysis)) {
    return null;
  }
  return {
    analysis: state.analysis,
    jobDraft: state.jobDraft,
    jobMatch: state.jobMatch,
    interviewPlan: state.interviewPlan,
    evaluations: state.evaluations,
    interviewSetupStage: state.interviewSetupStage,
    interviewProgress: state.interviewProgress,
    resumeChat: state.resumeChat,
    module: state.module,
    selectedSuggestionId: state.selectedSuggestionId,
    selectedTemplate: state.selectedTemplate,
    activeResumeVariantId: state.activeResumeVariantId,
    resumePanel: state.resumePanel,
    renders: state.renders,
  };
}

function restoredRenderMap(
  value: RecentAnalysisPayload["renders"],
  analysis: AnalysisBundle,
  jobMatch: JobMatchBundle | null,
): Partial<Record<TemplateId, RenderResponse>> {
  const targets = new Map<string, number>([
    [analysis.resume.id, analysis.resume.revision],
    ...(jobMatch?.variant
      ? [[jobMatch.variant.id, jobMatch.variant.revision] as [string, number]]
      : []),
  ]);
  const restored: Partial<Record<TemplateId, RenderResponse>> = {};
  for (const [template, candidate] of Object.entries(value ?? {})) {
    const parsed = RenderResponseSchema.safeParse(candidate);
    if (
      !parsed.success ||
      targets.get(parsed.data.report.resumeId) !==
        parsed.data.report.resumeRevision
    ) {
      continue;
    }
    restored[template as TemplateId] = parsed.data;
  }
  return restored;
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

let scheduledSessionArchive: ReturnType<typeof setTimeout> | null = null;

function cancelScheduledSessionArchive() {
  if (scheduledSessionArchive === null) return;
  clearTimeout(scheduledSessionArchive);
  scheduledSessionArchive = null;
}

function scheduleCurrentSessionArchive() {
  cancelScheduledSessionArchive();
  scheduledSessionArchive = setTimeout(() => {
    scheduledSessionArchive = null;
    const resumeId = useAppStore.getState().analysis?.resume.id;
    void saveCurrentSessionToRecent().then(
      (recentAnalyses) => {
        const current = useAppStore.getState();
        if (resumeId && current.analysis?.resume.id !== resumeId) return;
        useAppStore.setState({ recentAnalyses });
      },
      () => undefined,
    );
  }, 250);
}

function scheduleRevisionAiAnalysis(resumeId: string, revision: number) {
  queueMicrotask(() => void refreshRevisionAiAnalysis(resumeId, revision));
}

function scheduleRevisionAiAnalysisTarget(
  target: { resumeId: string; revision: number } | null,
) {
  if (target) scheduleRevisionAiAnalysis(target.resumeId, target.revision);
}

async function refreshRevisionAiAnalysis(resumeId: string, revision: number) {
  activeRevisionAnalysis?.controller.abort();
  const controller = new AbortController();
  const request = { resumeId, revision, controller };
  activeRevisionAnalysis = request;
  const state = useAppStore.getState();
  if (
    state.analysis?.resume.id !== resumeId ||
    state.analysis.resume.revision !== revision
  ) {
    activeRevisionAnalysis = null;
    return;
  }
  useAppStore.setState({
    analysis: {
      ...state.analysis,
      processing: {
        ...state.analysis.processing,
        aiAnalysis: {
          ...(state.analysis.processing.aiAnalysis ?? {
            analyzedRevision: state.analysis.scorecard.resumeRevision,
            scoreSourceVersion:
              state.analysis.scorecard.sourceVersion ??
              "legacy.resume.score@0.0.0",
            suggestionSourceVersion:
              state.analysis.processing.capabilityVersions["resume.suggest"] ??
              "legacy.resume.suggest@0.0.0",
          }),
          status: "refreshing",
        },
      },
    },
    error: null,
  });
  try {
    const { analyzeResumeRevision } = await import("./api");
    const current = useAppStore.getState().analysis;
    if (
      activeRevisionAnalysis !== request ||
      !current ||
      current.resume.id !== resumeId ||
      current.resume.revision !== revision
    ) {
      return;
    }
    const result = await analyzeResumeRevision(
      { resume: current.resume, claims: current.claims },
      controller.signal,
    );
    const latest = useAppStore.getState();
    if (
      activeRevisionAnalysis !== request ||
      latest.analysis?.resume.id !== result.resumeId ||
      latest.analysis.resume.revision !== result.resumeRevision
    ) {
      return;
    }
    const reviewedPaths = reviewedSuggestionPaths(
      latest.analysis.suggestions,
    );
    const unreviewedSuggestions = result.suggestions.filter(
      (suggestion) =>
        !suggestion.patches.some((patch) => reviewedPaths.has(patch.path)),
    );
    activeRevisionAnalysis = null;
    useAppStore.setState({
      analysis: {
        ...latest.analysis,
        scorecard: result.scorecard,
        suggestions: unreviewedSuggestions,
        processing: {
          ...latest.analysis.processing,
          capabilityVersions: {
            ...latest.analysis.processing.capabilityVersions,
            ...result.capabilityVersions,
          },
          aiAnalysis: {
            status: "fresh",
            analyzedRevision: result.resumeRevision,
            scoreSourceVersion: result.capabilityVersions["resume.score"],
            suggestionSourceVersion:
              result.capabilityVersions["resume.suggest"],
          },
        },
      },
      selectedSuggestionId:
        unreviewedSuggestions.find(
          (suggestion) => suggestion.status === "pending",
        )?.id ?? null,
      error: null,
    });
    try {
      const recentAnalyses = await saveCurrentSessionToRecent();
      const settled = useAppStore.getState();
      if (
        settled.analysis?.resume.id === resumeId &&
        settled.analysis.resume.revision === revision
      ) {
        useAppStore.setState({ recentAnalyses });
      }
    } catch (archiveError) {
      const settled = useAppStore.getState();
      if (
        settled.analysis?.resume.id === resumeId &&
        settled.analysis.resume.revision === revision
      ) {
        useAppStore.setState({
          error:
            archiveError instanceof Error
              ? `AI 分析已完成，但本机记录保存失败：${archiveError.message}`
              : "AI 分析已完成，但本机记录保存失败。",
        });
      }
    }
  } catch (error) {
    if (activeRevisionAnalysis !== request) return;
    activeRevisionAnalysis = null;
    if (controller.signal.aborted) return;
    const latest = useAppStore.getState();
    if (
      latest.analysis?.resume.id !== resumeId ||
      latest.analysis.resume.revision !== revision
    ) {
      return;
    }
    useAppStore.setState({
      analysis: {
        ...latest.analysis,
        processing: {
          ...latest.analysis.processing,
          aiAnalysis: {
            ...(latest.analysis.processing.aiAnalysis ?? {
              analyzedRevision: latest.analysis.scorecard.resumeRevision,
              scoreSourceVersion:
                latest.analysis.scorecard.sourceVersion ??
                "legacy.resume.score@0.0.0",
              suggestionSourceVersion:
                latest.analysis.processing.capabilityVersions[
                  "resume.suggest"
                ] ?? "legacy.resume.suggest@0.0.0",
            }),
            status: "failed",
          },
        },
      },
      error:
        error instanceof Error
          ? error.message
          : "当前版本的 AI 分析未完成，请重新进行 AI 分析。",
    });
  }
}

async function refreshCurrentSessionArchive(): Promise<
  RecentAnalysisSummary[]
> {
  const existing = await listRecentAnalyses();
  const state = useAppStore.getState();
  const suppressedId = state.archiveSuppressedForResumeId;
  const recentAnalyses =
    state.analysis &&
    state.stage === "workspace" &&
    state.analysis.resume.id !== suppressedId &&
    !hasSessionExpired(state.expiresAt)
      ? await saveCurrentSessionToRecent()
      : existing;
  const current = useAppStore.getState();
  if (current.analysis) {
    const record = await getRecentAnalysis(current.analysis.resume.id);
    const latest = useAppStore.getState();
    if (record && latest.analysis?.resume.id === record.id) {
      let originalPdfBase64 = latest.analysis.originalPdfBase64;
      if (!originalPdfBase64 && record.pdfBlob) {
        originalPdfBase64 = await blobToBase64(record.pdfBlob);
      }
      const cachedRenders = restoredRenderMap(
        record.payload.renders,
        latest.analysis,
        latest.jobMatch,
      );
      const shouldRestoreRenders =
        Object.keys(latest.renders).length === 0 &&
        Object.keys(cachedRenders).length > 0;
      if (originalPdfBase64 || shouldRestoreRenders) {
        useAppStore.setState({
          analysis: originalPdfBase64
            ? { ...latest.analysis, originalPdfBase64 }
            : latest.analysis,
          sourcePdfBlob: record.pdfBlob ?? latest.sourcePdfBlob,
          ...(shouldRestoreRenders ? { renders: cachedRenders } : {}),
        });
      }
    }
  }
  const latestSuppressedId =
    useAppStore.getState().archiveSuppressedForResumeId;
  return latestSuppressedId
    ? recentAnalyses.filter((record) => record.id !== latestSuppressedId)
    : recentAnalyses;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      stage: "upload",
      module: "resume",
      expiresAt: null,
      analysis: null,
      jobDraft: defaultJobDraft(),
      jobMatch: null,
      interviewPlan: null,
      interviewSessionVersion: 0,
      evaluations: [],
      interviewSetupStage: "intro",
      interviewProgress: null,
      resumeChat: null,
      selectedSuggestionId: null,
      activeResumeVariantId: null,
      resumePanel: "suggestions",
      selectedTemplate: "professional",
      previewMode: "original",
      previewedRenderHashes: [],
      renders: {},
      undoStack: [],
      sourcePdfBlob: null,
      recentAnalyses: [],
      recentAnalysesLoading: false,
      homeNavigationPending: false,
      archiveSuppressedForResumeId: null,
      error: null,
      setStage: (stage) => set({ stage }),
      setError: (error) => set({ error }),
      setModule: (module) => {
        let changed = false;
        set((state) => {
          if (state.homeNavigationPending) return state;
          const progressionLocked = Boolean(
            state.analysis &&
              (state.analysis.processing.aiAnalysis?.status !== "fresh" ||
                state.analysis.processing.aiAnalysis.analyzedRevision !==
                  state.analysis.resume.revision),
          );
          if (progressionLocked && module !== "resume") return state;
          if (module === state.module) return state;
          changed = true;
          return { module };
        });
        if (changed) scheduleCurrentSessionArchive();
      },
      setAnalysis: (analysis, suppliedPdfBlob) => {
        const normalizedAnalysis = {
          ...analysis,
          suggestions: ensureSuggestionScoreGains(
            analysis.suggestions,
            analysis.scorecard.total,
          ),
        };
        const sourcePdfBlob =
          suppliedPdfBlob ??
          (normalizedAnalysis.originalPdfBase64
            ? base64ToPdfBlob(normalizedAnalysis.originalPdfBase64)
            : null);
        set((state) => ({
          ...invalidatedDerivedState(),
          analysis: normalizedAnalysis,
          resumeChat: emptyResumeChatContext(
            normalizedAnalysis.resume.id,
            normalizedAnalysis.resume.revision,
          ),
          jobDraft: defaultJobDraft(normalizedAnalysis.resume.locale),
          sourcePdfBlob,
          interviewSessionVersion: state.interviewSessionVersion + 1,
          expiresAt: sessionExpiry(normalizedAnalysis),
          stage: "workspace",
          selectedSuggestionId:
            normalizedAnalysis.suggestions.find((item) => item.status === "pending")
              ?.id ?? null,
          undoStack: [],
          homeNavigationPending: false,
          archiveSuppressedForResumeId: null,
          error: null,
        }));
        void saveCurrentSessionToRecent().then(
          (recentAnalyses) => set({ recentAnalyses }),
          () => undefined,
        );
      },
      selectSuggestion: (selectedSuggestionId) =>
        set((state) =>
          state.homeNavigationPending
            ? state
            : { selectedSuggestionId, previewMode: "original" },
        ),
      decideSuggestion: (id, status, manualText) => {
        let reanalysisTarget: { resumeId: string; revision: number } | null = null;
        set((state) => {
          if (!state.analysis || state.homeNavigationPending) return state;
          const current = state.analysis.suggestions.find(
            (item) => item.id === id,
          );
          if (!current || current.status !== "pending") return state;
          const resumeRevision = state.analysis.resume.revision;
          if (current.resumeRevision !== resumeRevision) {
            const suggestions = state.analysis.suggestions.map((item) =>
              item.id === id ? { ...item, status: "stale" as const } : item,
            );
            return {
              analysis: { ...state.analysis, suggestions },
              selectedSuggestionId:
                suggestions.find((item) => item.status === "pending")?.id ?? id,
            };
          }
          if (
            (current.kind === "needs_proof" || current.kind === "ask_user") &&
            status === "accepted"
          ) {
            return state;
          }
          const normalizedManualText = manualText?.trim();
          if (status === "manual" && !normalizedManualText) return state;
          const updated = {
            ...current,
            status,
            proposedText: normalizedManualText ?? current.proposedText,
          };
          const shouldApply = status === "accepted" || status === "manual";
          const intentionalNoop =
            updated.kind === "use_as_is" ||
            (updated.kind !== "remove" &&
              updated.proposedText !== undefined &&
              updated.proposedText === updated.originalText);
          const intendsAstChange = shouldApply && !intentionalNoop;
          if (
            intendsAstChange &&
            !suggestionBeforeHashMatches(state.analysis.resume.ast, updated)
          ) {
            const suggestions = state.analysis.suggestions.map((item) =>
              item.id === id ? { ...item, status: "stale" as const } : item,
            );
            return {
              analysis: { ...state.analysis, suggestions },
              selectedSuggestionId:
                suggestions.find((item) => item.status === "pending")?.id ?? id,
            };
          }
          const nextAst = intendsAstChange
            ? applySuggestion(state.analysis.resume.ast, updated)
            : state.analysis.resume.ast;
          const changed = nextAst !== state.analysis.resume.ast;
          if (intendsAstChange && !changed) {
            const suggestions = state.analysis.suggestions.map((item) =>
              item.id === id ? { ...item, status: "stale" as const } : item,
            );
            return {
              analysis: { ...state.analysis, suggestions },
              selectedSuggestionId:
                suggestions.find((item) => item.status === "pending")?.id ?? id,
            };
          }
          const undoStack = [
            ...state.undoStack,
            snapshot(state.analysis),
          ].slice(-20);
          const decided = updated;
          const resume = changed
            ? {
                ...state.analysis.resume,
                revision: resumeRevision + 1,
                ast: nextAst,
              }
            : state.analysis.resume;
          const synchronizedGraph =
            shouldApply && !changed
              ? syncAcceptedUserClaims(state.analysis, decided)
              : null;
          if (changed) {
            const reanalysis = reanalyzeResumeRevision({
              analysis: state.analysis,
              resume,
              appliedSuggestion: decided,
              manualText:
                status === "manual" ? normalizedManualText : undefined,
            });
            const suggestions = state.analysis.suggestions.map((item) => {
              if (item.id === id) return decided;
              return item.status === "pending"
                ? rebindPendingSuggestion(item, nextAst, resume.revision)
                : item;
            });
            const nextAnalysis = {
              ...state.analysis,
              resume,
              claims: reanalysis.claims,
              evidence: reanalysis.evidence,
              suggestions,
              stories: reanalysis.stories,
              processing: processingAfterLocalRevision(
                state.analysis,
                reanalysis.capabilityVersions,
              ),
            };
            reanalysisTarget = {
              resumeId: resume.id,
              revision: resume.revision,
            };
            const finalText =
              status === "manual"
                ? normalizedManualText
                : decided.proposedText ?? "";
            const changeSummary =
              decided.kind === "remove"
                ? `已移除：${decided.originalText}`
                : `已将“${decided.originalText}”改为“${finalText}”`;
            return {
              analysis: nextAnalysis,
              resumeChat: resumeChatAfterRevision(
                state.resumeChat,
                nextAnalysis,
                changeSummary,
              ),
              selectedSuggestionId:
                suggestions.find((item) => item.status === "pending")?.id ?? id,
              undoStack,
              ...invalidatedDerivedState(
                state.resumePanel === "chat" ? "chat" : "suggestions",
              ),
              interviewSessionVersion: state.interviewSessionVersion + 1,
            };
          }
          const suggestions = state.analysis.suggestions.map((item) =>
            item.id === id ? decided : item,
          );
          const selectedSuggestionId =
            suggestions.find((item) => item.status === "pending")?.id ?? id;
          const nextAnalysis = {
            ...state.analysis,
            resume,
            suggestions,
            ...(synchronizedGraph ?? {}),
          };
          return {
            analysis: nextAnalysis,
            resumeChat: synchronizedGraph
              ? resumeChatAfterRevision(
                  state.resumeChat,
                  nextAnalysis,
                  `已确认事实：${updated.proposedText ?? updated.originalText}`,
                )
              : state.resumeChat,
            selectedSuggestionId,
            undoStack,
            ...(synchronizedGraph
              ? {
                  ...invalidatedDerivedState(),
                  interviewSessionVersion: state.interviewSessionVersion + 1,
                }
              : {}),
          };
        });
        scheduleRevisionAiAnalysisTarget(reanalysisTarget);
      },
      replaceAiSuggestions: (incoming, sourceVersion) =>
        set((state) => {
          if (
            !state.analysis ||
            state.homeNavigationPending ||
            !/^resume\.suggest@(?:[2-9]|\d{2,})\./.test(sourceVersion)
          ) {
            return state;
          }
          const resumeRevision = state.analysis.resume.revision;
          const generated = incoming.filter(
            (suggestion) =>
              suggestion.status === "pending" &&
              suggestion.resumeRevision === resumeRevision &&
              suggestionBeforeHashMatches(
                state.analysis!.resume.ast,
                suggestion,
              ),
          );
          const appliedHistory = state.analysis.suggestions.filter(
            (suggestion) =>
              suggestion.status === "accepted" ||
              suggestion.status === "manual",
          );
          const suggestions = [...appliedHistory, ...generated];
          return {
            analysis: {
              ...state.analysis,
              suggestions,
              processing: {
                ...state.analysis.processing,
                capabilityVersions: {
                  ...state.analysis.processing.capabilityVersions,
                  "resume.suggest": sourceVersion,
                },
              },
            },
            selectedSuggestionId:
              generated[0]?.id ?? appliedHistory.at(-1)?.id ?? null,
            error: null,
          };
        }),
      applyAiSuggestions: () => {
        let appliedCount = 0;
        let reanalysisTarget: { resumeId: string; revision: number } | null = null;
        set((state) => {
          if (!state.analysis || state.homeNavigationPending) return state;
          const candidates = safeAiRewriteSuggestions(state.analysis);
          if (candidates.length === 0) return state;

          let nextAst = state.analysis.resume.ast;
          const applied = new Map<string, Suggestion>();
          for (const suggestion of candidates) {
            const accepted = {
              ...suggestion,
              status: "accepted" as const,
            };
            const candidateAst = applySuggestion(nextAst, accepted);
            if (candidateAst === nextAst) continue;
            nextAst = candidateAst;
            applied.set(suggestion.id, accepted);
          }
          appliedCount = applied.size;
          if (appliedCount === 0) return state;

          const resume = {
            ...state.analysis.resume,
            revision: state.analysis.resume.revision + 1,
            ast: nextAst,
          };
          const firstApplied = applied.values().next().value!;
          const reanalysis = reanalyzeResumeRevision({
            analysis: state.analysis,
            resume,
            appliedSuggestion: firstApplied,
          });
          const suggestions = state.analysis.suggestions.map((suggestion) => {
            const accepted = applied.get(suggestion.id);
            if (accepted) return accepted;
            return suggestion.status === "pending"
              ? rebindPendingSuggestion(suggestion, nextAst, resume.revision)
              : suggestion;
          });
          const undoStack = [
            ...state.undoStack,
            snapshot(state.analysis),
          ].slice(-20);

          const nextAnalysis = {
            ...state.analysis,
            resume,
            claims: reanalysis.claims,
            evidence: reanalysis.evidence,
            suggestions,
            stories: reanalysis.stories,
            processing: processingAfterLocalRevision(
              state.analysis,
              reanalysis.capabilityVersions,
            ),
          };
          reanalysisTarget = {
            resumeId: resume.id,
            revision: resume.revision,
          };
          return {
            analysis: nextAnalysis,
            resumeChat: resumeChatAfterRevision(
              state.resumeChat,
              nextAnalysis,
              `已一键应用 ${appliedCount} 条 AI 改写。`,
            ),
            selectedSuggestionId:
              suggestions.find((suggestion) => suggestion.status === "pending")
                ?.id ?? firstApplied.id,
            undoStack,
            ...invalidatedDerivedState(),
            interviewSessionVersion: state.interviewSessionVersion + 1,
          };
        });
        scheduleRevisionAiAnalysisTarget(reanalysisTarget);
        return appliedCount;
      },
      applyManualResumeAst: (ast, changeSummary = "已直接编辑简历内容。") => {
        const parsed = ResumeASTSchema.safeParse(ast);
        if (!parsed.success) return null;
        let appliedRevision: number | null = null;
        set((state) => {
          if (!state.analysis || state.homeNavigationPending) return state;
          if (
            JSON.stringify(parsed.data) ===
            JSON.stringify(state.analysis.resume.ast)
          ) {
            return state;
          }
          const resume = {
            ...state.analysis.resume,
            revision: state.analysis.resume.revision + 1,
            ast: parsed.data,
          };
          const reanalysis = reanalyzeResumeRevision({
            analysis: state.analysis,
            resume,
          });
          const suggestions = state.analysis.suggestions.map((suggestion) =>
            suggestion.status === "pending"
              ? { ...suggestion, status: "stale" as const }
              : suggestion,
          );
          const undoStack = [
            ...state.undoStack,
            snapshot(state.analysis),
          ].slice(-20);
          const nextAnalysis = {
            ...state.analysis,
            resume,
            claims: reanalysis.claims,
            evidence: reanalysis.evidence,
            suggestions,
            stories: reanalysis.stories,
            processing: processingAfterLocalRevision(
              state.analysis,
              reanalysis.capabilityVersions,
            ),
          };
          appliedRevision = resume.revision;
          return {
            analysis: nextAnalysis,
            resumeChat: resumeChatAfterRevision(
              state.resumeChat,
              nextAnalysis,
              changeSummary,
            ),
            selectedSuggestionId:
              suggestions.find((suggestion) => suggestion.status !== "stale")
                ?.id ?? null,
            undoStack,
            ...invalidatedDerivedState("templates"),
            interviewSessionVersion: state.interviewSessionVersion + 1,
          };
        });
        if (appliedRevision !== null) {
          const currentResume = get().analysis?.resume;
          if (currentResume && currentResume.revision === appliedRevision) {
            scheduleRevisionAiAnalysis(
              currentResume.id,
              currentResume.revision,
            );
          }
        }
        return appliedRevision;
      },
      retryAiAnalysis: () => {
        const analysis = get().analysis;
        if (analysis) {
          scheduleRevisionAiAnalysis(
            analysis.resume.id,
            analysis.resume.revision,
          );
        }
      },
      beginResumeChatTurn: (content) => {
        const normalized = content.trim();
        if (!normalized || normalized.length > 4_000) return null;
        let created: ResumeChatMessage | null = null;
        set((state) => {
          if (!state.analysis || state.homeNavigationPending) return state;
          const current = normalizeResumeChatContext(
            state.resumeChat,
            state.analysis.resume.id,
            state.analysis.resume.revision,
          );
          created = {
            id: resumeChatMessageId("user"),
            role: "user",
            content: normalized,
            createdAt: new Date().toISOString(),
            resumeRevision: state.analysis.resume.revision,
            suggestionIds: [],
          };
          return {
            resumeChat: ResumeChatContextSchema.parse({
              ...current,
              sourceResumeRevision: state.analysis.resume.revision,
              confirmedFacts: resumeChatConfirmedFacts(
                current,
                state.analysis.claims,
              ),
              messages: [...current.messages, created].slice(
                -RESUME_CHAT_MAX_MESSAGES,
              ),
            }),
          };
        });
        return created;
      },
      completeResumeChatTurn: (userMessageId, response) => {
        let completed = false;
        set((state) => {
          if (
            !state.analysis ||
            !state.resumeChat ||
            state.homeNavigationPending ||
            !/^resume\.chat@(?:[2-9]|\d{2,})\./.test(response.sourceVersion)
          ) {
            return state;
          }
          const userMessage = state.resumeChat.messages.find(
            (message) =>
              message.id === userMessageId && message.role === "user",
          );
          if (!userMessage) return state;

          const stale =
            userMessage.resumeRevision !== state.analysis.resume.revision;
          const incoming = response.suggestions.map((suggestion) =>
            stale ||
            suggestion.resumeRevision !== state.analysis!.resume.revision ||
            !suggestionBeforeHashMatches(
              state.analysis!.resume.ast,
              suggestion,
            )
              ? { ...suggestion, status: "stale" as const }
              : suggestion,
          );
          const incomingById = new Map(incoming.map((item) => [item.id, item]));
          const suggestions = state.analysis.suggestions.map((item) => {
            const replacement = incomingById.get(item.id);
            if (!replacement) return item;
            incomingById.delete(item.id);
            return item.status === "accepted" || item.status === "manual"
              ? item
              : replacement;
          });
          suggestions.push(...incomingById.values());
          const assistantMessage: ResumeChatMessage = {
            id: resumeChatMessageId("assistant"),
            role: "assistant",
            content: response.reply,
            createdAt: new Date().toISOString(),
            resumeRevision: userMessage.resumeRevision,
            suggestionIds: incoming.map((suggestion) => suggestion.id),
          };
          const context = normalizeResumeChatContext(
            state.resumeChat,
            state.analysis.resume.id,
            state.analysis.resume.revision,
          );
          completed = true;
          return {
            analysis: {
              ...state.analysis,
              suggestions,
              processing: {
                ...state.analysis.processing,
                capabilityVersions: {
                  ...state.analysis.processing.capabilityVersions,
                  "resume.chat": response.sourceVersion,
                },
              },
            },
            resumeChat: ResumeChatContextSchema.parse({
              ...context,
              sourceResumeRevision: state.analysis.resume.revision,
              summary: response.summary,
              confirmedFacts: [
                ...new Set([
                  ...resumeChatConfirmedFacts(context, state.analysis.claims),
                  ...response.confirmedFacts,
                ]),
              ].slice(-100),
              messages: [...context.messages, assistantMessage].slice(
                -RESUME_CHAT_MAX_MESSAGES,
              ),
            }),
            error: null,
          };
        });
        if (completed) {
          void saveCurrentSessionToRecent().then(
            (recentAnalyses) => set({ recentAnalyses }),
            () => undefined,
          );
        }
        return completed;
      },
      clearResumeChat: () => {
        set((state) =>
          state.analysis
            ? {
                resumeChat: emptyResumeChatContext(
                  state.analysis.resume.id,
                  state.analysis.resume.revision,
                ),
              }
            : state,
        );
        void saveCurrentSessionToRecent().then(
          (recentAnalyses) => set({ recentAnalyses }),
          () => undefined,
        );
      },
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
              item.status !== "pending" ||
              item.resumeRevision !== state.analysis!.resume.revision ||
              !suggestionBeforeHashMatches(state.analysis!.resume.ast, item) ||
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
          const nextAnalysis = {
            ...state.analysis,
            claims,
            suggestions,
            evidence,
          };
          return {
            analysis: nextAnalysis,
            resumeChat: resumeChatAfterRevision(
              state.resumeChat,
              nextAnalysis,
              `已确认事实：${confirmedText}`,
            ),
            undoStack,
            ...invalidatedDerivedState(),
            interviewSessionVersion: state.interviewSessionVersion + 1,
          };
        }),
      stageEvidenceRewrite: (
        suggestionId,
        supplementalFacts,
        rewrittenText,
        sourceVersion,
      ) => {
        let staged = false;
        set((state) => {
          if (!state.analysis || state.homeNavigationPending) return state;
          const facts = supplementalFacts.trim();
          const rewrite = rewrittenText.trim();
          const suggestion = state.analysis.suggestions.find(
            (item) => item.id === suggestionId,
          );
          if (
            !facts ||
            !rewrite ||
            !suggestion ||
            suggestion.status !== "pending" ||
            suggestion.resumeRevision !== state.analysis.resume.revision ||
            (suggestion.kind !== "needs_proof" &&
              suggestion.kind !== "ask_user") ||
            !suggestionBeforeHashMatches(
              state.analysis.resume.ast,
              suggestion,
            )
          ) {
            return state;
          }
          const patches = confirmedReplacePatch(
            state.analysis.resume.ast,
            suggestion,
            rewrite,
          );
          if (!patches) return state;

          const suggestionSourceIds = new Set(suggestion.sourceBlockIds);
          const linkedClaim =
            state.analysis.claims.find((claim) =>
              suggestion.claimIds.includes(claim.id),
            ) ??
            state.analysis.claims.find(
              (claim) =>
                normalizeText(claim.text) ===
                  normalizeText(suggestion.originalText) &&
                (suggestionSourceIds.size === 0 ||
                  claim.sourceBlockIds.some((id) =>
                    suggestionSourceIds.has(id),
                  )),
            );
          const claimId =
            linkedClaim?.id ??
            stableId(
              "claim-user",
              `${state.analysis.resume.id}:${state.analysis.resume.revision}:${suggestion.id}`,
            );
          const evidenceId = stableId(
            "user-statement",
            `${claimId}:${suggestion.id}`,
          );
          const userStatement: EvidenceAsset = {
            id: evidenceId,
            kind: "user_statement",
            label: "用户补充事实",
            content: facts,
            sourceBlockIds: [],
            verifiedByUser: true,
            confidence: 0.9,
          };
          const claims: Claim[] = linkedClaim
            ? state.analysis.claims.map((claim) =>
                claim.id === claimId
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
              )
            : [
                ...state.analysis.claims,
                {
                  id: claimId,
                  text: suggestion.originalText,
                  ...claimParts(suggestion.originalText),
                  sourceBlockIds: suggestion.sourceBlockIds,
                  evidenceAssetIds: [evidenceId],
                  status: "user_confirmed",
                  confidence: 0.8,
                },
              ];
          const suggestions = state.analysis.suggestions.map((item) =>
            item.id === suggestion.id
              ? {
                  ...item,
                  claimIds: [...new Set([...item.claimIds, claimId])],
                  kind: "rewrite" as const,
                  proposedText: rewrite,
                  patches,
                  rationale: `${item.rationale} AI 已根据补充事实生成改写，请核对后接受。`,
                }
              : item,
          );
          const evidence = [
            ...state.analysis.evidence.filter(
              (asset) => asset.id !== evidenceId,
            ),
            userStatement,
          ];
          const nextAnalysis = {
            ...state.analysis,
            claims,
            suggestions,
            evidence,
            processing: {
              ...state.analysis.processing,
              capabilityVersions: {
                ...state.analysis.processing.capabilityVersions,
                [sourceVersion.split("@")[0] || "copy.rewrite"]:
                  sourceVersion,
              },
            },
          };
          staged = true;
          return {
            analysis: nextAnalysis,
            resumeChat: resumeChatAfterRevision(
              state.resumeChat,
              nextAnalysis,
              `已补充事实并生成待审阅改写：${facts}`,
            ),
            undoStack: [
              ...state.undoStack,
              snapshot(state.analysis),
            ].slice(-20),
            ...invalidatedDerivedState(),
            interviewSessionVersion: state.interviewSessionVersion + 1,
          };
        });
        return staged;
      },
      undo: () => {
        activeRevisionAnalysis?.controller.abort();
        activeRevisionAnalysis = null;
        let aiRevision: { resumeId: string; revision: number } | null = null;
        set((state) => {
          if (
            !state.analysis ||
            state.undoStack.length === 0 ||
            state.homeNavigationPending
          )
            return state;
          const previous = state.undoStack[state.undoStack.length - 1];
          const restored = restoreSnapshot(state.analysis, previous);
          const restoredAi = restored.processing?.aiAnalysis;
          if (
            !restoredAi ||
            restoredAi.status !== "fresh" ||
            restoredAi.analyzedRevision !== restored.resume.revision
          ) {
            aiRevision = {
              resumeId: restored.resume.id,
              revision: restored.resume.revision,
            };
          }
          const invalidatesDerived =
            previous.resume.id !== state.analysis.resume.id ||
            previous.resume.revision !== state.analysis.resume.revision ||
            JSON.stringify(previous.resume.ast) !==
              JSON.stringify(state.analysis.resume.ast) ||
            evidenceGraphChanged(state.analysis, previous);
          return {
            analysis: restored,
            resumeChat: resumeChatAfterRevision(
              state.resumeChat,
              restored,
              `已撤销到简历版本 ${restored.resume.revision}。`,
            ),
            selectedSuggestionId:
              restored.suggestions.find((item) => item.status === "pending")
                ?.id ??
              restored.suggestions[0]?.id ??
              null,
            undoStack: state.undoStack.slice(0, -1),
            ...(invalidatesDerived
              ? {
                  ...invalidatedDerivedState(),
                  interviewSessionVersion: state.interviewSessionVersion + 1,
                }
              : {}),
          };
        });
        scheduleRevisionAiAnalysisTarget(aiRevision);
      },
      updateJobDraft: (update) =>
        set((state) => {
          if (state.homeNavigationPending || state.stage !== "workspace")
            return state;
          const parsed = JobDraftSchema.safeParse({
            ...state.jobDraft,
            ...update,
          });
          if (!parsed.success) return state;
          const jobDraft = parsed.data;
          if (JSON.stringify(jobDraft) === JSON.stringify(state.jobDraft))
            return state;
          const hasDerivedJobState = Boolean(
            state.jobMatch ||
            state.activeResumeVariantId ||
            state.interviewPlan ||
            state.evaluations.length > 0 ||
            state.interviewProgress,
          );
          return hasDerivedJobState
            ? {
                jobDraft,
                ...invalidatedDerivedState(),
                interviewSessionVersion: state.interviewSessionVersion + 1,
              }
            : { jobDraft };
        }),
      setJobMatch: (jobMatch) =>
        set((state) => {
          if (state.homeNavigationPending || state.stage !== "workspace")
            return state;
          if (!isJobMatchForAnalysis(state.analysis, jobMatch)) return state;
          return {
            jobMatch,
            activeResumeVariantId: null,
            resumePanel: "suggestions",
            interviewPlan: null,
            interviewSessionVersion: state.interviewSessionVersion + 1,
            evaluations: [],
            interviewSetupStage: "intro",
            interviewProgress: null,
            ...(state.activeResumeVariantId
              ? {
                  previewMode: "original" as const,
                  previewedRenderHashes: [],
                  renders: {},
                }
              : {}),
          };
        }),
      setResumeVariant: (variantId) =>
        set((state) => {
          if (
            state.homeNavigationPending ||
            state.stage !== "workspace" ||
            !state.analysis
          ) {
            return state;
          }
          const nextVariantId =
            variantId !== null && state.jobMatch?.variant?.id === variantId
              ? variantId
              : null;
          if (nextVariantId === state.activeResumeVariantId) return state;
          return {
            activeResumeVariantId: nextVariantId,
            resumePanel: "templates",
            previewMode: "current",
            previewedRenderHashes: [],
            renders: {},
          };
        }),
      setResumePanel: (resumePanel) =>
        set((state) => {
          if (state.homeNavigationPending) return state;
          if (
            resumePanel === "suggestions" &&
            state.activeResumeVariantId !== null
          ) {
            return {
              resumePanel,
              activeResumeVariantId: null,
              previewMode: "original",
              previewedRenderHashes: [],
              renders: {},
            };
          }
          return { resumePanel };
        }),
      setInterviewPlan: (interviewPlan) => {
        let changed = false;
        set((state) => {
          if (state.homeNavigationPending || state.stage !== "workspace")
            return state;
          if (!isInterviewPlanForAnalysis(state.analysis, interviewPlan))
            return state;
          changed = true;
          return {
            interviewPlan,
            interviewSessionVersion: state.interviewSessionVersion + 1,
            evaluations: [],
            interviewSetupStage: "intro",
            interviewProgress: state.analysis
              ? newInterviewProgress(state.analysis, interviewPlan, [])
              : null,
          };
        });
        if (changed) scheduleCurrentSessionArchive();
      },
      addEvaluation: (evaluation) => {
        let changed = false;
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
          changed = true;
          return {
            evaluations: [
              ...state.evaluations,
              normalizeEvaluation(evaluation),
            ],
          };
        });
        if (changed) scheduleCurrentSessionArchive();
      },
      setInterviewSetupStage: (interviewSetupStage) => {
        let changed = false;
        set((state) => {
          if (
            state.homeNavigationPending ||
            state.stage !== "workspace" ||
            state.interviewPlan
          ) {
            return state;
          }
          const nextStage = normalizeInterviewSetupStage(interviewSetupStage);
          if (nextStage === state.interviewSetupStage) return state;
          changed = true;
          return { interviewSetupStage: nextStage };
        });
        if (changed) scheduleCurrentSessionArchive();
      },
      updateInterviewProgress: (update) => {
        let changed = false;
        set((state) => {
          if (
            state.homeNavigationPending ||
            state.stage !== "workspace" ||
            !state.interviewProgress
          ) {
            return state;
          }
          const next = normalizeInterviewProgress(
            state.analysis,
            state.interviewPlan,
            state.evaluations,
            { ...state.interviewProgress, ...update },
          );
          if (
            !next ||
            JSON.stringify(next) === JSON.stringify(state.interviewProgress)
          )
            return state;
          changed = true;
          return { interviewProgress: next };
        });
        if (changed) scheduleCurrentSessionArchive();
      },
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
              isRenderForActiveResume(state, render),
          );
          if (!isCurrent || state.previewedRenderHashes.includes(sha256))
            return state;
          return {
            previewedRenderHashes: [...state.previewedRenderHashes, sha256],
          };
        }),
      setRender: (render) => {
        let accepted = false;
        set((state) => {
          if (state.homeNavigationPending || state.stage !== "workspace")
            return state;
          if (!isRenderForActiveResume(state, render)) return state;
          accepted = true;
          return {
            renders: { ...state.renders, [render.template]: render },
            previewMode: "current",
          };
        });
        if (accepted) {
          void saveCurrentSessionToRecent().then(
            (recentAnalyses) => set({ recentAnalyses }),
            () => undefined,
          );
        }
      },
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
            archiveSuppressedForResumeId: null,
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
        set((state) => {
          const archiveSuppressedForResumeId =
            state.analysis?.resume.id ?? null;
          return {
            stage: "upload",
            recentAnalyses: archiveSuppressedForResumeId
              ? state.recentAnalyses.filter(
                  (record) => record.id !== archiveSuppressedForResumeId,
                )
              : state.recentAnalyses,
            homeNavigationPending: false,
            archiveSuppressedForResumeId,
            error: null,
          };
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

        const analysis = {
          ...parsedAnalysis.data,
          suggestions: ensureSuggestionScoreGains(
            parsedAnalysis.data.suggestions,
            parsedAnalysis.data.scorecard.total,
          ),
        };
        if (!hasFreshRequiredAiAnalysis(analysis)) {
          set({
            stage: "upload",
            error: record.pdfBlob
              ? "这是一条旧版本地分析，请使用原 PDF 重新进行 AI 分析。"
              : "这是一条旧版本地分析，原 PDF 已释放，请重新上传后进行 AI 分析。",
          });
          return false;
        }
        const parsedJobMatch = record.payload.jobMatch
          ? JobMatchBundleSchema.safeParse(record.payload.jobMatch)
          : null;
        const jobMatch =
          parsedJobMatch?.success &&
          isJobMatchForAnalysis(analysis, parsedJobMatch.data)
            ? parsedJobMatch.data
            : null;
        const jobDraft = normalizeJobDraft(
          record.payload.jobDraft,
          analysis,
          jobMatch,
        );
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
        const interviewProgress = normalizeInterviewProgress(
          analysis,
          interviewPlan,
          evaluations,
          record.payload.interviewProgress,
        );
        const requestedModule = ["resume", "job", "interview"].includes(
          record.payload.module,
        )
          ? record.payload.module
          : "resume";
        const restoredModule = analysis.suggestions.some(
          (suggestion) => suggestion.status === "pending",
        )
          ? "resume"
          : requestedModule;
        const selectedSuggestionId = analysis.suggestions.some(
          (suggestion) => suggestion.id === record.payload.selectedSuggestionId,
        )
          ? record.payload.selectedSuggestionId
          : (analysis.suggestions.find(
              (suggestion) => suggestion.status === "pending",
            )?.id ?? null);
        const activeResumeVariantId =
          jobMatch?.variant?.id === record.payload.activeResumeVariantId
            ? record.payload.activeResumeVariantId
            : null;
        const resumePanel =
          record.payload.resumePanel === "templates" ||
          record.payload.resumePanel === "chat"
            ? record.payload.resumePanel
            : "suggestions";
        const resumeChat = normalizeResumeChatContext(
          record.payload.resumeChat,
          analysis.resume.id,
          analysis.resume.revision,
        );
        const renders = restoredRenderMap(
          record.payload.renders,
          analysis,
          jobMatch,
        );
        const hasCachedRender = Object.keys(renders).length > 0;

        set((state) => ({
          stage: "workspace",
          module: restoredModule,
          expiresAt: record.expiresAt,
          analysis,
          jobDraft,
          jobMatch,
          interviewPlan,
          interviewSessionVersion: state.interviewSessionVersion + 1,
          evaluations,
          interviewSetupStage: normalizeInterviewSetupStage(
            record.payload.interviewSetupStage,
          ),
          interviewProgress,
          resumeChat,
          selectedSuggestionId,
          activeResumeVariantId,
          resumePanel,
          selectedTemplate: record.payload.selectedTemplate,
          previewMode:
            activeResumeVariantId || hasCachedRender ? "current" : "original",
          previewedRenderHashes: [],
          renders,
          undoStack: [],
          sourcePdfBlob: record.pdfBlob ?? null,
          homeNavigationPending: false,
          archiveSuppressedForResumeId: null,
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
                jobDraft: defaultJobDraft(),
                jobMatch: null,
                interviewPlan: null,
                interviewSessionVersion: state.interviewSessionVersion + 1,
                evaluations: [],
                interviewSetupStage: "intro",
                interviewProgress: null,
                resumeChat: null,
                selectedSuggestionId: null,
                activeResumeVariantId: null,
                resumePanel: "suggestions",
                selectedTemplate: "professional",
                previewMode: "original",
                previewedRenderHashes: [],
                renders: {},
                undoStack: [],
                sourcePdfBlob: null,
                recentAnalyses,
                homeNavigationPending: false,
                archiveSuppressedForResumeId: null,
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
              originalPdfBase64: undefined,
            }
          : null,
        jobDraft: state.jobDraft,
        jobMatch: state.jobMatch,
        interviewPlan: state.interviewPlan,
        evaluations: state.evaluations,
        interviewSetupStage: state.interviewSetupStage,
        interviewProgress: state.interviewProgress,
        resumeChat: state.resumeChat,
        selectedSuggestionId: state.selectedSuggestionId,
        activeResumeVariantId: state.activeResumeVariantId,
        resumePanel: state.resumePanel,
        selectedTemplate: state.selectedTemplate,
        undoStack: state.undoStack.map(persistedSnapshot),
        archiveSuppressedForResumeId: state.archiveSuppressedForResumeId,
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
