// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalysisBundle } from "./contracts";
import { loadDemoAnalysis, matchJob } from "./api";
import { useAppStore } from "./store";
import { ResumeASTSchema } from "@/lib/domain";

const ast = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: { name: "候选人", links: [] },
  sections: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAppStore.getState().reset();
});

describe("version-bound client requests", () => {
  it("sends the active resume revision with a job-match request", async () => {
    useAppStore.setState({
      analysis: { resume: { id: "resume-current", revision: 6 } } as AnalysisBundle,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "stop after request capture" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      matchJob({
        jdText: "这是一个长度足够的岗位描述，用于验证客户端会发送当前简历版本号。",
        jobTitle: "高级产品经理",
        seniority: "高级",
        location: "上海",
        language: "zh-CN",
        resumeId: "resume-current",
        ast,
        claims: [],
        evidence: [],
      }),
    ).rejects.toThrow("stop after request capture");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      resumeId: "resume-current",
      revision: 6,
      jobTitle: "高级产品经理",
      seniority: "高级",
      location: "上海",
      language: "zh-CN",
    });
    expect(new Headers(request.headers).has("x-resume-session")).toBe(false);
  });

  it("does not send a client-controlled rate-limit identity for demo analysis", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadDemoAnalysis()).rejects.toThrow("示例暂时无法加载");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).has("x-resume-session")).toBe(false);
  });
});
