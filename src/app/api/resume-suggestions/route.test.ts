import { beforeEach, describe, expect, it, vi } from "vitest";

import { stableId } from "@/lib/baseline/utils";
import { ResumeDocumentSchema, SuggestionSchema } from "@/lib/domain";

const mocks = vi.hoisted(() => ({
  invokeCapability: vi.fn(),
  enforceAiRateLimit: vi.fn(),
}));

vi.mock("@/lib/server/capability-runtime", () => ({
  invokeCapability: mocks.invokeCapability,
}));

vi.mock("@/lib/server/ai-rate-limit", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/server/ai-rate-limit")
  >();
  return {
    ...original,
    enforceAiRateLimit: mocks.enforceAiRateLimit,
  };
});

import { POST } from "./route";

const resume = ResumeDocumentSchema.parse({
  id: "resume-1",
  revision: 0,
  originalFileName: "resume.pdf",
  mimeType: "application/pdf",
  locale: "zh-CN",
  pageCount: 1,
  parseMethod: "native",
  sourceBlocks: [
    {
      id: "block-1",
      pageIndex: 0,
      order: 0,
      text: "主要负责平台开发",
      bbox: { x: 0.1, y: 0.2, width: 0.5, height: 0.03 },
      source: "native",
      confidence: 1,
      role: "list-item",
    },
  ],
  ast: {
    schemaVersion: "1.0",
    locale: "zh-CN",
    contact: { name: "候选人", links: [] },
    sections: [
      {
        id: "experience",
        type: "experience",
        title: "工作经历",
        sourceBlockIds: ["block-1"],
        entries: [
          {
            id: "entry-1",
            title: "工程师",
            current: true,
            bullets: ["主要负责平台开发"],
            keywords: [],
            sourceBlockIds: ["block-1"],
          },
        ],
      },
    ],
  },
  parsingWarnings: [],
});

const suggestion = SuggestionSchema.parse({
  id: "suggestion-ai-1",
  resumeRevision: 0,
  sourceBlockIds: ["block-1"],
  claimIds: [],
  kind: "rewrite",
  status: "pending",
  originalText: "主要负责平台开发",
  proposedText: "负责平台开发",
  rationale: "删去“主要”这一弱化词，让职责表达更直接。",
  beforeHash: stableId("hash", "主要负责平台开发"),
  patches: [
    {
      operation: "replace",
      path: "/sections/0/entries/0/bullets/0",
      value: "负责平台开发",
    },
  ],
  affectedDimensions: ["clarity"],
  factRisk: "none",
  interviewRisk: "none",
});

function request() {
  return new Request("http://localhost/api/resume-suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resume, claims: [] }),
  });
}

describe("POST /api/resume-suggestions", () => {
  beforeEach(() => {
    mocks.invokeCapability.mockReset();
    mocks.enforceAiRateLimit.mockReset();
  });

  it("returns only enhanced AI suggestions", async () => {
    mocks.invokeCapability.mockResolvedValue({
      data: { suggestions: [suggestion] },
      sourceVersion: "resume.suggest@2.0.0",
      durationMs: 1234,
      usedFallback: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      suggestions: [{ id: "suggestion-ai-1" }],
      sourceVersion: "resume.suggest@2.0.0",
      durationMs: 1234,
    });
  });

  it("fails visibly instead of returning baseline template suggestions", async () => {
    mocks.invokeCapability.mockResolvedValue({
      data: { suggestions: [suggestion] },
      sourceVersion: "resume.suggest@1.0.0",
      durationMs: 30,
      usedFallback: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("未使用本地模板替代"),
    });
  });
});
