import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResumeDocumentSchema } from "@/lib/domain";
import { AiRateLimitError } from "@/lib/server/ai-rate-limit";
import { AiAnalysisUnavailableError } from "@/lib/server/ai/required-ai";

const mocks = vi.hoisted(() => ({
  analyzeResumeRevisionWithAi: vi.fn(),
  assertResumeAnalysisResponseForRequest: vi.fn(),
  enforceAiRateLimit: vi.fn(),
}));

vi.mock("@/lib/server/resume-analysis", () => ({
  analyzeResumeRevisionWithAi: mocks.analyzeResumeRevisionWithAi,
  assertResumeAnalysisResponseForRequest:
    mocks.assertResumeAnalysisResponseForRequest,
}));

vi.mock("@/lib/server/ai-rate-limit", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/server/ai-rate-limit")
  >();
  return { ...original, enforceAiRateLimit: mocks.enforceAiRateLimit };
});

import { POST } from "./route";

const resume = ResumeDocumentSchema.parse({
  id: "resume-revision-1",
  revision: 3,
  originalFileName: "resume.pdf",
  mimeType: "application/pdf",
  locale: "zh-CN",
  pageCount: 1,
  parseMethod: "native",
  sourceBlocks: [],
  ast: {
    schemaVersion: "1.0",
    locale: "zh-CN",
    contact: { name: "候选人", links: [] },
    sections: [],
  },
  parsingWarnings: [],
});

const dimensionIds = [
  "impact",
  "completeness",
  "clarity",
  "structure",
  "ats",
  "language",
] as const;

function successResult() {
  return {
    resumeId: resume.id,
    resumeRevision: resume.revision,
    scorecard: {
      resumeId: resume.id,
      resumeRevision: resume.revision,
      total: 82,
      summary: "AI 已完成当前版本分析。",
      sourceVersion: "resume.score@2.1.0",
      dimensions: dimensionIds.map((id) => ({
        id,
        label: id,
        score: 10,
        maxScore: 20,
        evidence: [],
        deductions: [],
      })),
    },
    suggestions: [],
    capabilityVersions: {
      "resume.score": "resume.score@2.1.0",
      "resume.suggest": "resume.suggest@2.2.0",
    },
    durationMs: 123,
  };
}

function request(body: unknown = { resume, claims: [] }) {
  return new Request("http://localhost/api/resume-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/resume-analysis", () => {
  beforeEach(() => {
    mocks.analyzeResumeRevisionWithAi.mockReset();
    mocks.assertResumeAnalysisResponseForRequest.mockReset();
    mocks.assertResumeAnalysisResponseForRequest.mockImplementation(
      (value, requestedResume: { id: string; revision: number }) => {
        const result = value as {
          resumeId: string;
          resumeRevision: number;
        };
        if (
          result.resumeId !== requestedResume.id ||
          result.resumeRevision !== requestedResume.revision
        ) {
          throw new AiAnalysisUnavailableError(
            "resume.score",
            "invalid_response",
            true,
          );
        }
        return value;
      },
    );
    mocks.enforceAiRateLimit.mockReset();
  });

  it("returns an atomic enhanced score and suggestion result", async () => {
    mocks.analyzeResumeRevisionWithAi.mockResolvedValue(successResult());

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resumeId: resume.id,
      resumeRevision: 3,
      capabilityVersions: {
        "resume.score": "resume.score@2.1.0",
        "resume.suggest": "resume.suggest@2.2.0",
      },
      suggestions: [],
    });
    expect(mocks.enforceAiRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "analysis",
    );
    expect(mocks.analyzeResumeRevisionWithAi).toHaveBeenCalledOnce();
  });

  it.each([
    ["resume.score", "not_configured", 503],
    ["resume.score", "timeout", 504],
    ["resume.suggest", "provider_error", 503],
    ["resume.suggest", "invalid_response", 503],
  ] as const)(
    "returns no partial bundle when %s fails with %s",
    async (failedCapability, reason, expectedStatus) => {
      mocks.analyzeResumeRevisionWithAi.mockRejectedValue(
        new AiAnalysisUnavailableError(
          failedCapability,
          reason,
          reason !== "not_configured",
        ),
      );

      const response = await POST(request());
      const payload = await response.json();

      expect(response.status).toBe(expectedStatus);
      expect(payload).toEqual({
        error: "AI 分析未完成，未返回本地模板结果，请稍后重试。",
        code: "AI_ANALYSIS_UNAVAILABLE",
        retryable: reason !== "not_configured",
        failedCapability,
      });
      expect(payload).not.toHaveProperty("scorecard");
      expect(payload).not.toHaveProperty("suggestions");
    },
  );

  it("maps application rate limiting to 429 with retry metadata", async () => {
    mocks.enforceAiRateLimit.mockRejectedValue(new AiRateLimitError(37));

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    await expect(response.json()).resolves.toEqual({
      error: "请求过于频繁，请稍后重试。",
      code: "RATE_LIMITED",
    });
    expect(mocks.analyzeResumeRevisionWithAi).not.toHaveBeenCalled();
  });

  it("rejects a body larger than 512 KB before rate limiting or AI calls", async () => {
    const oversized = new Request("http://localhost/api/resume-analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array(512 * 1_024 + 1),
    });

    const response = await POST(oversized);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(mocks.enforceAiRateLimit).not.toHaveBeenCalled();
    expect(mocks.analyzeResumeRevisionWithAi).not.toHaveBeenCalled();
  });

  it("rejects a helper result whose revision does not match the request", async () => {
    mocks.analyzeResumeRevisionWithAi.mockResolvedValue({
      ...successResult(),
      resumeRevision: resume.revision - 1,
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "AI_ANALYSIS_UNAVAILABLE",
      failedCapability: "resume.score",
    });
  });
});
