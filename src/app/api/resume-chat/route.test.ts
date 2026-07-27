import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResumeDocumentSchema } from "@/lib/domain";

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
  id: "resume-chat-1",
  revision: 2,
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

function request() {
  return new Request("http://localhost/api/resume-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resume,
      claims: [],
      summary: "用户希望表达简洁。",
      confirmedFacts: [],
      recentChanges: [],
      recentMessages: [],
      userMessage: "先分析我的项目经历。",
    }),
  });
}

describe("POST /api/resume-chat", () => {
  beforeEach(() => {
    mocks.invokeCapability.mockReset();
    mocks.enforceAiRateLimit.mockReset();
  });

  it("returns an enhanced contextual AI turn", async () => {
    mocks.invokeCapability.mockResolvedValue({
      data: {
        reply: "你的项目经历可以先收紧动作与结果之间的关系。",
        summary: "用户希望表达简洁，正在审阅项目经历。",
        confirmedFacts: [],
        suggestions: [],
      },
      sourceVersion: "resume.chat@2.0.0",
      durationMs: 2_345,
      usedFallback: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reply: expect.stringContaining("项目经历"),
      sourceVersion: "resume.chat@2.0.0",
      durationMs: 2_345,
    });
    expect(mocks.enforceAiRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "chat",
    );
  });

  it("fails visibly instead of returning a local chat script", async () => {
    mocks.invokeCapability.mockResolvedValue({
      data: {
        reply: "AI 编辑对话当前不可用。",
        summary: "尚未建立 AI 编辑对话摘要。",
        confirmedFacts: [],
        suggestions: [],
      },
      sourceVersion: "resume.chat@1.0.0",
      durationMs: 1,
      usedFallback: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("未使用本地话术替代"),
    });
  });
});
