import {
  AnalysisBundleSchema,
  EvidenceRewriteResponseSchema,
  EvaluationResponseSchema,
  InterviewPlanSchema,
  InitialAnalysisBundleSchema,
  JobMatchBundleSchema,
  LayoutRecommendationSchema,
  RenderResponseSchema,
  ResumeAnalysisResponseSchema,
  TranscriptionResponseSchema,
  type AnalysisBundle,
  type EvidenceRewriteRequest,
  type EvidenceRewriteResponse,
  type EvaluationResponse,
  type InterviewPlan,
  type InitialAnalysisBundle,
  type JobMatchBundle,
  type LayoutRecommendation,
  type RenderResponse,
  type ResumeAnalysisResponse,
  type TranscriptionResponse,
} from "./contracts";
import type {
  Claim,
  EvidenceAsset,
  InterviewQuestion,
  InterviewStory,
  ResumeAST,
  ResumeDocument,
  ResumeTemplateId,
} from "@/lib/domain";
import {
  ResumeChatInputSchema,
  ResumeChatResponseSchema,
  type ResumeChatInput,
  type ResumeChatResponse,
} from "@/lib/resume-chat";
import {
  revokeTrackedObjectUrl,
  trackObjectUrl,
  trackedFetch,
} from "./runtime-resources";
import {
  hasFreshRequiredAiAnalysis,
  isDemoTemplateAnalysis,
  isRequiredAiSource,
} from "./ai-analysis";
import { FIXED_RESUME_TEMPLATE } from "@/lib/resume-layout";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryable?: boolean,
    readonly failedCapability?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: string;
      code?: string;
      retryable?: boolean;
      failedCapability?: string;
    };
    const retryAfter = Number(response.headers.get("retry-after"));
    return new ApiError(
      payload.error ?? `请求失败 (${response.status})`,
      response.status,
      payload.code,
      payload.retryable,
      payload.failedCapability,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  } catch {
    return new ApiError(`请求失败 (${response.status})`, response.status);
  }
}

function assertFreshAiAnalysis<T extends AnalysisBundle>(analysis: T): T {
  if (!hasFreshRequiredAiAnalysis(analysis)) {
    throw new ApiError(
      "AI 分析来源校验失败，未载入本地模板结果，请重新进行 AI 分析。",
      502,
      "INVALID_AI_ANALYSIS",
      true,
    );
  }
  return analysis;
}

export async function aiAnalysisAvailable(signal?: AbortSignal) {
  const response = await trackedFetch("/api/health", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return false;
  const payload = (await response.json()) as {
    components?: { ai?: { status?: string; mode?: string } };
  };
  return (
    payload.components?.ai?.status === "ready" &&
    payload.components.ai.mode === "enhanced"
  );
}

export async function analyzeResume(
  file: File,
  jdText?: string,
  signal?: AbortSignal,
): Promise<InitialAnalysisBundle> {
  const form = new FormData();
  form.append("file", file);
  if (jdText?.trim()) form.append("jdText", jdText.trim());
  const response = await trackedFetch("/api/analyze", {
    method: "POST",
    body: form,
    signal,
  });
  if (!response.ok) throw await apiError(response);
  return assertFreshAiAnalysis(
    InitialAnalysisBundleSchema.parse(await response.json()),
  );
}

export async function analyzeResumeRevision(
  input: { resume: ResumeDocument; claims: Claim[] },
  signal?: AbortSignal,
): Promise<ResumeAnalysisResponse> {
  const response = await trackedFetch("/api/resume-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await apiError(response);
  const result = ResumeAnalysisResponseSchema.parse(await response.json());
  if (
    result.resumeId !== input.resume.id ||
    result.resumeRevision !== input.resume.revision ||
    !isRequiredAiSource("resume.score", result.capabilityVersions["resume.score"]) ||
    !isRequiredAiSource("resume.suggest", result.capabilityVersions["resume.suggest"])
  ) {
    throw new ApiError(
      "AI 重分析结果与当前简历版本不一致，请重新进行 AI 分析。",
      502,
      "INVALID_AI_ANALYSIS",
      true,
    );
  }
  return result;
}

export async function generateEvidenceRewrite(
  input: EvidenceRewriteRequest,
  signal?: AbortSignal,
): Promise<EvidenceRewriteResponse> {
  const response = await trackedFetch("/api/evidence-rewrite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await apiError(response);
  const result = EvidenceRewriteResponseSchema.parse(await response.json());
  if (
    result.resumeId !== input.resumeId ||
    result.resumeRevision !== input.resumeRevision ||
    result.suggestionId !== input.suggestionId ||
    !/^copy\.rewrite\.(?:zh|en)@(?:[2-9]|\d{2,})\./.test(
      result.sourceVersion,
    )
  ) {
    throw new ApiError(
      "AI 改写结果与当前建议不一致，请重新生成。",
      502,
      "INVALID_EVIDENCE_REWRITE",
      true,
    );
  }
  return result;
}

export async function sendResumeChatMessage(
  input: ResumeChatInput,
  signal?: AbortSignal,
): Promise<ResumeChatResponse> {
  const response = await trackedFetch("/api/resume-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ResumeChatInputSchema.parse(input)),
    signal,
  });
  if (!response.ok) throw await apiError(response);
  return ResumeChatResponseSchema.parse(await response.json());
}

export async function loadDemoAnalysis(
  signal?: AbortSignal,
): Promise<AnalysisBundle> {
  const response = await trackedFetch("/api/demo", {
    signal,
  });
  if (!response.ok) throw await apiError(response);
  const analysis = AnalysisBundleSchema.parse(await response.json());
  if (!isDemoTemplateAnalysis(analysis)) {
    throw new ApiError(
      "体验示例来源校验失败，请刷新后重试。",
      502,
      "INVALID_DEMO_ANALYSIS",
      true,
    );
  }
  return analysis;
}

export async function matchJob(input: {
  jdText: string;
  jobTitle?: string;
  seniority?: string;
  location?: string;
  language?: "zh-CN" | "en-US";
  resumeId: string;
  revision: number;
  ast: ResumeAST;
  claims: Claim[];
  evidence: EvidenceAsset[];
}): Promise<JobMatchBundle> {
  const response = await trackedFetch("/api/job-match", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await apiError(response);
  const parsed = JobMatchBundleSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(
      "岗位 AI 分析未返回可验证的真实 AI 结果，请重试。",
      502,
      "INVALID_JOB_MATCH",
      true,
    );
  }
  const result = parsed.data;
  if (
    result.sourceResumeId !== input.resumeId ||
    result.sourceResumeRevision !== input.revision
  ) {
    throw new ApiError(
      "岗位分析结果与当前简历版本不一致，请重新分析。",
      502,
      "INVALID_JOB_MATCH",
      true,
    );
  }
  return result;
}

export async function createInterviewPlan(input: {
  resumeId: string;
  revision: number;
  ast: ResumeAST;
  claims: Claim[];
  stories: InterviewStory[];
  jdText?: string;
}): Promise<InterviewPlan> {
  const response = await trackedFetch("/api/interview/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await apiError(response);
  const parsed = InterviewPlanSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(
      "AI 面试计划缺少可验证的真实 AI 结果，请重试。",
      502,
      "INVALID_INTERVIEW_PLAN",
      true,
    );
  }
  const result = parsed.data;
  if (
    result.sourceResumeId !== input.resumeId ||
    result.sourceResumeRevision !== input.revision ||
    (input.jdText && !result.capabilityVersions["jd.parse"])
  ) {
    throw new ApiError(
      "AI 面试计划与当前简历或岗位不一致，请重新生成。",
      502,
      "INVALID_INTERVIEW_PLAN",
      true,
    );
  }
  return result;
}

export async function evaluateAnswer(input: {
  resumeId: string;
  revision: number;
  question: InterviewQuestion;
  answer: string;
  claims: Claim[];
}): Promise<EvaluationResponse> {
  const response = await trackedFetch("/api/interview/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await apiError(response);
  const parsed = EvaluationResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(
      "AI 面试评审缺少可验证的真实 AI 结果，请重试。",
      502,
      "INVALID_INTERVIEW_EVALUATION",
      true,
    );
  }
  const result = parsed.data;
  if (
    result.sourceResumeId !== input.resumeId ||
    result.sourceResumeRevision !== input.revision ||
    result.evaluation.questionId !== input.question.id
  ) {
    throw new ApiError(
      "AI 面试评审与当前问题或简历版本不一致，请重新评审。",
      502,
      "INVALID_INTERVIEW_EVALUATION",
      true,
    );
  }
  return result;
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
  if (!response.ok) throw await apiError(response);
  return TranscriptionResponseSchema.parse(await response.json());
}

export async function transcribeRecordedSpeech(input: {
  audio: Blob;
  locale: "zh-CN" | "en-US" | "zh-TW" | "mixed";
  browserTranscript: string;
  browserConfidence?: number;
  signal?: AbortSignal;
}): Promise<TranscriptionResponse> {
  const extension = input.audio.type.includes("mp4")
    ? "m4a"
    : input.audio.type.includes("ogg")
      ? "ogg"
      : input.audio.type.includes("wav")
        ? "wav"
        : "webm";
  const form = new FormData();
  form.set("audio", input.audio, `interview-answer.${extension}`);
  form.set("locale", input.locale);
  form.set("browserTranscript", input.browserTranscript);
  if (input.browserConfidence !== undefined) {
    form.set("browserConfidence", String(input.browserConfidence));
  }
  const response = await trackedFetch("/api/interview/transcribe", {
    method: "POST",
    body: form,
    signal: input.signal,
  });
  if (!response.ok) throw await apiError(response);
  return TranscriptionResponseSchema.parse(await response.json());
}

export async function renderResume(input: {
  resumeId: string;
  revision: number;
  ast: ResumeAST;
  template?: ResumeTemplateId;
  sourcePageCount?: number;
}): Promise<RenderResponse> {
  const response = await trackedFetch("/api/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, template: FIXED_RESUME_TEMPLATE }),
  });
  if (!response.ok) throw await apiError(response);
  const render = RenderResponseSchema.parse(await response.json());
  if (
    render.template !== FIXED_RESUME_TEMPLATE ||
    render.report.template !== FIXED_RESUME_TEMPLATE
  ) {
    throw new Error("服务端未按 Compact 模板生成 PDF，请重新生成。");
  }
  return render;
}

export async function recommendLayout(input: {
  ast: ResumeAST;
  targetPages: number;
  preferredTemplate?: ResumeTemplateId;
}): Promise<LayoutRecommendation> {
  const response = await trackedFetch("/api/layout-recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await apiError(response);
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
  revision: number;
  template: ResumeTemplateId;
  render: RenderResponse;
}) {
  if (!input.render.hardGate.passed || !input.render.report.downloadable) {
    throw new Error("当前 PDF 仍有致命导出错误，无法下载。");
  }
  const binary = window.atob(input.render.pdfBase64);
  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  const actualSha256 = await arrayBufferSha256(bytes.buffer);
  if (
    actualSha256 !== input.render.sha256 ||
    input.render.report.artifactSha256 !== input.render.sha256
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
