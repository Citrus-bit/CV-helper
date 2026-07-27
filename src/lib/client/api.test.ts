// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import type { RenderResponse } from "./contracts";
import { downloadVerifiedResume, loadDemoAnalysis, matchJob } from "./api";
import { ResumeASTSchema } from "@/lib/domain";

const ast = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: { name: "候选人", links: [] },
  sections: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("version-bound client requests", () => {
  it("sends the explicitly provided resume revision with a job-match request", async () => {
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
        revision: 6,
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

    await expect(loadDemoAnalysis()).rejects.toThrow("请求失败 (503)");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).has("x-resume-session")).toBe(false);
  });
});

describe("verified local download", () => {
  function renderFixture(sha256: string): RenderResponse {
    const hardGate = { passed: true, blockingCheckIds: [] };
    return {
      template: "professional",
      pdfBase64: "JVBERi0=",
      sha256,
      byteLength: 5,
      searchableText: true,
      astContentCovered: true,
      hardGate,
      report: {
        resumeId: "resume-download",
        resumeRevision: 1,
        template: "professional",
        artifactSha256: sha256,
        pageCount: 1,
        downloadable: true,
        searchableText: true,
        contentComplete: true,
        hardGate,
        overallScore: 90,
        checks: [],
        generatedAt: "2026-07-27T00:00:00.000Z",
      },
    };
  }

  it("downloads the exact audited preview without a network request", async () => {
    const sha256 = createHash("sha256")
      .update(Buffer.from("JVBERi0=", "base64"))
      .digest("hex");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:verified-resume");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await downloadVerifiedResume({
      revision: 1,
      template: "professional",
      render: renderFixture(sha256),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("rejects a cached artifact whose bytes no longer match its report", async () => {
    await expect(
      downloadVerifiedResume({
        revision: 1,
        template: "professional",
        render: renderFixture("a".repeat(64)),
      }),
    ).rejects.toThrow("下载产物与已确认预览不一致");
  });
});
