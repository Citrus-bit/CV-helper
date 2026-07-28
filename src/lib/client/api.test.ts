// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import type { RenderResponse } from "./contracts";
import {
  createInterviewPlan,
  downloadVerifiedResume,
  evaluateAnswer,
  generateEvidenceRewrite,
  loadDemoAnalysis,
  matchJob,
} from "./api";
import { ResumeASTSchema } from "@/lib/domain";

const ast = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: { name: "候选人", links: [] },
  sections: [],
});

const interviewQuestion = {
  id: "question-client-ai",
  locale: "zh-CN" as const,
  prompt: "请介绍一次可核实的项目改进经历。",
  category: "resume" as const,
  difficulty: "intermediate" as const,
  roleFamilies: [],
  skills: [],
  followUps: [],
  scoringAnchors: [],
  source: "client-test",
  generated: false,
  referenceQuestionIds: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("version-bound client requests", () => {
  it("accepts only an evidence rewrite bound to the requested suggestion revision", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        resumeId: "resume-current",
        resumeRevision: 6,
        suggestionId: "suggestion-current",
        rewrittenText: "使用 JMeter 完成 QPS 1000 场景压测。",
        sourceVersion: "copy.rewrite.zh@2.0.0",
        durationMs: 800,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateEvidenceRewrite({
        resumeId: "resume-current",
        resumeRevision: 6,
        suggestionId: "suggestion-current",
        locale: "zh-CN",
        originalText: "完成接口性能优化。",
        supplementalFacts: "使用 JMeter，压测 QPS 为 1000。",
      }),
    ).resolves.toMatchObject({
      rewrittenText: expect.stringContaining("JMeter"),
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      resumeId: "resume-current",
      resumeRevision: 6,
      suggestionId: "suggestion-current",
    });
  });

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

  it("rejects a job result whose matching capability came from baseline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          sourceResumeId: "resume-current",
          sourceResumeRevision: 6,
          job: {
            id: "job-client-ai",
            title: "算法工程师",
            locale: "zh-CN",
            rawText: "算法工程师岗位要求机器学习、模型评估与工程部署经验。",
          },
          requirements: [],
          mappings: [],
          coverage: 0,
          summary: "仅表示材料覆盖率。",
          riskFlags: [],
          capabilityVersions: {
            "jd.parse": "jd.parse@2.0.0",
            "job.match": "job.match@1.0.0",
          },
        }),
      ),
    );

    await expect(
      matchJob({
        jdText: "算法工程师岗位要求机器学习、模型评估与工程部署经验。",
        resumeId: "resume-current",
        revision: 6,
        ast,
        claims: [],
        evidence: [],
      }),
    ).rejects.toThrow("岗位 AI 分析未返回可验证的真实 AI 结果");
  });

  it("rejects an interview plan that omits AI parsing for its target JD", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          sourceResumeId: "resume-current",
          sourceResumeRevision: 6,
          questions: [interviewQuestion],
          stories: [],
          durationMinutes: 20,
          maxFollowUps: 2,
          capabilityVersions: {
            "interview.plan": "interview.plan@2.0.0",
          },
        }),
      ),
    );

    await expect(
      createInterviewPlan({
        resumeId: "resume-current",
        revision: 6,
        ast,
        claims: [],
        stories: [],
        jdText: "算法工程师岗位要求机器学习、模型评估与工程部署经验。",
      }),
    ).rejects.toThrow("AI 面试计划与当前简历或岗位不一致");
  });

  it("rejects an interview review containing any baseline AI source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          sourceResumeId: "resume-current",
          sourceResumeRevision: 6,
          evaluation: {
            questionId: interviewQuestion.id,
            overallScore: 80,
            dimensions: {
              relevance: 16,
              structure: 16,
              evidence: 16,
              roleCompetency: 16,
              clarity: 16,
            },
            strengths: [],
            improvements: [],
            citedAnswerFragments: [],
          },
          consistencyWarnings: [],
          capabilityVersions: {
            "answer.evaluate": "answer.evaluate@2.0.0",
            "answer.coach": "answer.coach@1.0.0",
          },
        }),
      ),
    );

    await expect(
      evaluateAnswer({
        resumeId: "resume-current",
        revision: 6,
        question: interviewQuestion,
        answer: "我梳理了流程并协调团队完成改进，结果可以通过项目记录核对。",
        claims: [],
      }),
    ).rejects.toThrow("AI 面试评审缺少可验证的真实 AI 结果");
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
