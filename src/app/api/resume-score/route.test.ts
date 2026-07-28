import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResumeDocumentSchema } from "@/lib/domain";

const mocks = vi.hoisted(() => ({
  enforceAiRateLimit: vi.fn(),
  scoreResumeRevisionWithAi: vi.fn(),
}));

vi.mock("@/lib/server/ai-rate-limit", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/server/ai-rate-limit")
  >();
  return { ...original, enforceAiRateLimit: mocks.enforceAiRateLimit };
});

vi.mock("@/lib/server/resume-analysis", () => ({
  scoreResumeRevisionWithAi: mocks.scoreResumeRevisionWithAi,
}));

import { POST } from "./route";

const resume = ResumeDocumentSchema.parse({
  id: "resume-final-score",
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

function finalScoreResult() {
  return {
    resumeId: resume.id,
    resumeRevision: resume.revision,
    scorecard: {
      resumeId: resume.id,
      resumeRevision: resume.revision,
      total: 88,
      summary: "最终评分已完成。",
      sourceVersion: "resume.score@2.1.0",
      dimensions: dimensionIds.map((id) => ({
        id,
        label: id,
        score: id === "impact" ? 23 : 13,
        maxScore: id === "impact" ? 25 : 15,
        evidence: [],
        deductions: [],
      })),
    },
    sourceVersion: "resume.score@2.1.0",
    durationMs: 25,
  };
}

describe("POST /api/resume-score", () => {
  beforeEach(() => {
    mocks.enforceAiRateLimit.mockReset();
    mocks.scoreResumeRevisionWithAi.mockReset();
  });

  it("returns a final score without a suggestion payload", async () => {
    mocks.scoreResumeRevisionWithAi.mockResolvedValue(finalScoreResult());
    const request = new Request("http://localhost/api/resume-score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resume, claims: [] }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      resumeId: resume.id,
      resumeRevision: resume.revision,
      scorecard: { total: 88 },
      sourceVersion: "resume.score@2.1.0",
    });
    expect(payload).not.toHaveProperty("suggestions");
    expect(mocks.enforceAiRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "analysis",
    );
    expect(mocks.scoreResumeRevisionWithAi).toHaveBeenCalledOnce();
  });

  it("rejects an invalid request before scoring", async () => {
    const response = await POST(
      new Request("http://localhost/api/resume-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resume: { id: "incomplete" }, claims: [] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.enforceAiRateLimit).not.toHaveBeenCalled();
    expect(mocks.scoreResumeRevisionWithAi).not.toHaveBeenCalled();
  });
});
