import {
  AnalysisBundleSchema,
  EvaluationResponseSchema,
  InterviewPlanSchema,
  JobMatchBundleSchema,
  LayoutRecommendationSchema,
  RenderResponseSchema,
  TranscriptionResponseSchema,
  type AnalysisBundle,
  type EvaluationResponse,
  type InterviewPlan,
  type JobMatchBundle,
  type LayoutRecommendation,
  type RenderResponse,
  type TranscriptionResponse,
} from "./contracts";
import type {
  Claim,
  EvidenceAsset,
  InterviewQuestion,
  InterviewStory,
  ResumeAST,
} from "@/lib/domain";
import { useAppStore, type TemplateId } from "./store";
import {
  revokeTrackedObjectUrl,
  trackObjectUrl,
  trackedFetch,
} from "./runtime-resources";

type ResumeReference = {
  resumeId?: string;
  revision?: number;
};

function apiSessionHeaders(
  additional: Record<string, string> = {},
): Record<string, string> {
  return additional;
}

function bindActiveResume(reference: ResumeReference) {
  const activeResume = useAppStore.getState().analysis?.resume;
  const resumeId = reference.resumeId ?? activeResume?.id;
  const revision =
    reference.revision ??
    (activeResume?.id === resumeId ? activeResume?.revision : undefined);
  if (!resumeId || revision === undefined) {
    throw new Error("无法确认当前简历版本，请重新载入后再试。");
  }
  return { resumeId, revision };
}

async function errorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `请求失败 (${response.status})`;
  } catch {
    return `请求失败 (${response.status})`;
  }
}

export async function analyzeResume(
  file: File,
  signal?: AbortSignal,
): Promise<AnalysisBundle> {
  const form = new FormData();
  form.append("file", file);
  const response = await trackedFetch("/api/analyze", {
    method: "POST",
    headers: apiSessionHeaders(),
    body: form,
    signal,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return AnalysisBundleSchema.parse(await response.json());
}

export async function loadDemoAnalysis(
  signal?: AbortSignal,
): Promise<AnalysisBundle> {
  const response = await trackedFetch("/api/demo", {
    headers: apiSessionHeaders(),
    signal,
  });
  if (!response.ok) throw new Error("示例暂时无法加载。");
  return AnalysisBundleSchema.parse(await response.json());
}

export async function matchJob(input: {
  jdText: string;
  jobTitle?: string;
  seniority?: string;
  location?: string;
  language?: "zh-CN" | "en-US";
  resumeId: string;
  revision?: number;
  ast: ResumeAST;
  claims: Claim[];
  evidence: EvidenceAsset[];
}): Promise<JobMatchBundle> {
  const reference = bindActiveResume(input);
  const response = await trackedFetch("/api/job-match", {
    method: "POST",
    headers: apiSessionHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ ...input, ...reference }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return JobMatchBundleSchema.parse(await response.json());
}

export async function createInterviewPlan(input: {
  resumeId?: string;
  revision?: number;
  ast: ResumeAST;
  claims: Claim[];
  stories: InterviewStory[];
  jdText?: string;
}): Promise<InterviewPlan> {
  const reference = bindActiveResume(input);
  const response = await trackedFetch("/api/interview/plan", {
    method: "POST",
    headers: apiSessionHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ ...input, ...reference }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return InterviewPlanSchema.parse({
    ...(await response.json()),
    sourceResumeId: reference.resumeId,
    sourceResumeRevision: reference.revision,
  });
}

export async function evaluateAnswer(input: {
  resumeId?: string;
  revision?: number;
  question: InterviewQuestion;
  answer: string;
  claims: Claim[];
}): Promise<EvaluationResponse> {
  const reference = bindActiveResume(input);
  const response = await trackedFetch("/api/interview/evaluate", {
    method: "POST",
    headers: apiSessionHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ ...input, ...reference }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return EvaluationResponseSchema.parse({
    ...(await response.json()),
    sourceResumeId: reference.resumeId,
    sourceResumeRevision: reference.revision,
  });
}

export async function transcribeBrowserSpeech(input: {
  browserTranscript: string;
  locale: "zh-CN" | "en-US" | "zh-TW" | "mixed";
  browserConfidence?: number;
}): Promise<TranscriptionResponse> {
  const response = await trackedFetch("/api/interview/transcribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, isFinal: true }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return TranscriptionResponseSchema.parse(await response.json());
}

export async function renderResume(input: {
  resumeId: string;
  revision: number;
  ast: ResumeAST;
  template: TemplateId;
  sourcePageCount?: number;
}): Promise<RenderResponse> {
  const response = await trackedFetch("/api/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return RenderResponseSchema.parse(await response.json());
}

export async function recommendLayout(input: {
  ast: ResumeAST;
  targetPages: number;
  preferredTemplate?: TemplateId;
}): Promise<LayoutRecommendation> {
  const response = await trackedFetch("/api/layout-recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return LayoutRecommendationSchema.parse(await response.json());
}

function arrayBufferSha256(bytes: ArrayBuffer) {
  return crypto.subtle
    .digest("SHA-256", bytes)
    .then((digest) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    );
}

export async function downloadVerifiedResume(input: {
  resumeId: string;
  revision: number;
  ast: ResumeAST;
  template: TemplateId;
  render: RenderResponse;
  sourcePageCount?: number;
}) {
  const response = await trackedFetch("/api/export/download", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resumeId: input.resumeId,
      revision: input.revision,
      ast: input.ast,
      template: input.template,
      pdfBase64: input.render.pdfBase64,
      expectedSha256: input.render.sha256,
      sourcePageCount: input.sourcePageCount,
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));

  const bytes = await response.arrayBuffer();
  const responseSha256 = response.headers.get("x-artifact-sha256");
  const actualSha256 = await arrayBufferSha256(bytes);
  if (
    responseSha256 !== input.render.sha256 ||
    actualSha256 !== input.render.sha256
  ) {
    throw new Error("下载产物与已确认预览不一致，已停止下载。");
  }

  const blobUrl = trackObjectUrl(
    URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
  );
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = `resume-${input.template}-r${input.revision}.pdf`;
  anchor.click();
  window.setTimeout(() => revokeTrackedObjectUrl(blobUrl), 1_000);
}

export function pdfDataUrl(base64: string) {
  return `data:application/pdf;base64,${base64}`;
}
