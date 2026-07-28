import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeRequiredAiCapability: vi.fn(),
  enforceAiRateLimit: vi.fn(),
}));

vi.mock("@/lib/server/capability-runtime", () => ({
  invokeRequiredAiCapability: mocks.invokeRequiredAiCapability,
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

function request() {
  return new Request("http://localhost/api/evidence-rewrite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resumeId: "resume-1",
      resumeRevision: 2,
      suggestionId: "suggestion-1",
      locale: "zh-CN",
      originalText: "将接口响应时间从 500ms 降低至 150ms。",
      supplementalFacts: "使用 JMeter 在 QPS 1000 场景下完成压测。",
    }),
  });
}

describe("POST /api/evidence-rewrite", () => {
  beforeEach(() => {
    mocks.invokeRequiredAiCapability.mockReset();
    mocks.enforceAiRateLimit.mockReset();
  });

  it("combines the original text and user facts into an enhanced AI rewrite", async () => {
    mocks.invokeRequiredAiCapability.mockResolvedValue({
      data: {
        original:
          "将接口响应时间从 500ms 降低至 150ms。\n使用 JMeter 在 QPS 1000 场景下完成压测。",
        rewritten:
          "使用 JMeter 在 QPS 1000 场景下完成压测，将接口响应时间从 500ms 降低至 150ms。",
        changes: ["合并压测口径与性能结果"],
        addedFacts: false,
      },
      sourceVersion: "copy.rewrite.zh@2.0.0",
      durationMs: 1_200,
      usedFallback: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resumeId: "resume-1",
      resumeRevision: 2,
      suggestionId: "suggestion-1",
      rewrittenText: expect.stringContaining("JMeter"),
      sourceVersion: "copy.rewrite.zh@2.0.0",
    });
    expect(mocks.enforceAiRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "chat",
    );
    expect(mocks.invokeRequiredAiCapability).toHaveBeenCalledWith(
      "copy.rewrite.zh",
      expect.objectContaining({
        text: expect.stringContaining("QPS 1000"),
        preserveTerms: expect.arrayContaining([
          "500ms",
          "150ms",
          "JMeter",
          "QPS",
          "1000",
        ]),
      }),
      expect.any(Object),
    );
  });

  it("rejects an empty supplemental answer before invoking AI", async () => {
    const invalid = new Request("http://localhost/api/evidence-rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resumeId: "resume-1",
        resumeRevision: 2,
        suggestionId: "suggestion-1",
        locale: "zh-CN",
        originalText: "原始内容",
        supplementalFacts: " ",
      }),
    });

    const response = await POST(invalid);

    expect(response.status).toBe(400);
    expect(mocks.invokeRequiredAiCapability).not.toHaveBeenCalled();
  });
});
