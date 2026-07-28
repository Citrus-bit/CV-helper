import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResumeDocumentSchema } from "@/lib/domain";
import { AiAnalysisUnavailableError } from "./ai/required-ai";

const mocks = vi.hoisted(() => ({
  invokeRequiredAiCapability: vi.fn(),
}));

vi.mock("./capability-runtime", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("./capability-runtime")
  >();
  return {
    ...original,
    invokeRequiredAiCapability: mocks.invokeRequiredAiCapability,
  };
});

import {
  analyzeResumeRevisionWithAi,
  assertResumeAnalysisResponseForRequest,
} from "./resume-analysis";

const resume = ResumeDocumentSchema.parse({
  id: "resume-service-1",
  revision: 4,
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

function scoreData(revision = resume.revision) {
  return {
    resumeId: resume.id,
    resumeRevision: revision,
    total: 80,
    summary: "AI 服务评分",
    dimensions: dimensionIds.map((id) => ({
      id,
      label: id,
      score: 10,
      maxScore: 20,
      evidence: [],
      deductions: [],
    })),
  };
}

function capabilityResult(data: unknown, sourceVersion: string) {
  return {
    data,
    confidence: 0.9,
    evidenceReferences: [],
    warnings: [],
    sourceVersion,
    durationMs: 1,
    usedFallback: false,
  };
}

describe("revision AI analysis service", () => {
  beforeEach(() => {
    mocks.invokeRequiredAiCapability.mockReset();
  });

  it("calls score then suggestions and returns one version-bound result", async () => {
    mocks.invokeRequiredAiCapability
      .mockResolvedValueOnce(
        capabilityResult(scoreData(), "resume.score@2.1.0"),
      )
      .mockResolvedValueOnce(
        capabilityResult({ suggestions: [] }, "resume.suggest@2.2.0"),
      );

    const result = await analyzeResumeRevisionWithAi({ resume, claims: [] });

    expect(
      mocks.invokeRequiredAiCapability.mock.calls.map((call) => call[0]),
    ).toEqual(["resume.score", "resume.suggest"]);
    expect(mocks.invokeRequiredAiCapability.mock.calls[1]?.[1]).toMatchObject({
      resume,
      claims: [],
      scoreContext: scoreData(),
    });
    expect(result).toMatchObject({
      resumeId: resume.id,
      resumeRevision: resume.revision,
      scorecard: { sourceVersion: "resume.score@2.1.0" },
      suggestions: [],
      capabilityVersions: {
        "resume.score": "resume.score@2.1.0",
        "resume.suggest": "resume.suggest@2.2.0",
      },
    });
  });

  it("does not call suggestions or expose a partial score when scoring fails", async () => {
    mocks.invokeRequiredAiCapability.mockRejectedValueOnce(
      new AiAnalysisUnavailableError("resume.score", "timeout", true, 504),
    );

    await expect(
      analyzeResumeRevisionWithAi({ resume, claims: [] }),
    ).rejects.toMatchObject({
      failedCapability: "resume.score",
      reason: "timeout",
    });
    expect(mocks.invokeRequiredAiCapability).toHaveBeenCalledOnce();
  });

  it("rejects the whole operation when suggestions fail after a score", async () => {
    mocks.invokeRequiredAiCapability
      .mockResolvedValueOnce(
        capabilityResult(scoreData(), "resume.score@2.1.0"),
      )
      .mockRejectedValueOnce(
        new AiAnalysisUnavailableError(
          "resume.suggest",
          "invalid_response",
          true,
        ),
      );

    await expect(
      analyzeResumeRevisionWithAi({ resume, claims: [] }),
    ).rejects.toMatchObject({
      failedCapability: "resume.suggest",
      reason: "invalid_response",
    });
    expect(mocks.invokeRequiredAiCapability).toHaveBeenCalledTimes(2);
  });

  it("rejects mismatched revisions and non-enhanced source versions", () => {
    const value = {
      resumeId: resume.id,
      resumeRevision: resume.revision,
      scorecard: {
        ...scoreData(resume.revision - 1),
        sourceVersion: "resume.score@1.0.0",
      },
      suggestions: [],
      capabilityVersions: {
        "resume.score": "resume.score@1.0.0",
        "resume.suggest": "resume.suggest@2.0.0",
      },
      durationMs: 1,
    };

    expect(() =>
      assertResumeAnalysisResponseForRequest(value, resume),
    ).toThrowError(
      expect.objectContaining({
        failedCapability: "resume.score",
        reason: "invalid_response",
      }),
    );
  });
});
