import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { CapabilityContext } from "@/lib/capabilities";
import {
  InterviewQuestionSchema,
  ResumeDocumentSchema,
  ScorecardSchema,
  type InterviewQuestion,
  type Suggestion,
} from "@/lib/domain";
import { createServerCapabilityRegistry } from "@/lib/server/capability-runtime";

import {
  loadProviderGatewayConfig,
  OpenAiCompatibleGateway,
  ProviderGatewayConfigurationError,
  type ProviderGatewayLogEvent,
} from "./provider-gateway";
import { providerInstructions } from "./provider-capabilities";

const providerEnvironment = {
  AI_PROVIDER: "provider_gateway",
  AI_API_BASE: "https://yunwu.ai/v1",
  AI_API_KEY: "test-secret-key",
  AI_MODEL: "test-model",
} as const;

const resume = ResumeDocumentSchema.parse({
  id: "resume-ai",
  revision: 3,
  originalFileName: "alice-private-resume.pdf",
  mimeType: "application/pdf",
  locale: "zh-CN",
  pageCount: 1,
  parseMethod: "native",
  sourceBlocks: [
    {
      id: "block-contact",
      pageIndex: 0,
      order: 0,
      text: "Alice Zhang alice@example.com +86 138 0000 0000 https://example.com/alice",
      bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.05 },
      source: "native",
      confidence: 1,
      role: "contact",
    },
    {
      id: "block-result",
      pageIndex: 0,
      order: 1,
      text: "负责上线流程，将交付周期缩短 20%.",
      bbox: { x: 0.1, y: 0.2, width: 0.8, height: 0.05 },
      source: "native",
      confidence: 1,
      role: "list-item",
    },
  ],
  ast: {
    schemaVersion: "1.0",
    locale: "zh-CN",
    contact: {
      name: "Alice Zhang",
      email: "alice@example.com",
      phone: "+86 138 0000 0000",
      links: [{ label: "site", url: "https://example.com/alice" }],
    },
    sections: [
      {
        id: "experience",
        type: "experience",
        title: "工作经历",
        sourceBlockIds: ["block-result"],
        entries: [
          {
            id: "entry-1",
            title: "产品经理",
            current: true,
            bullets: ["负责上线流程，将交付周期缩短 20%."],
            keywords: ["交付"],
            sourceBlockIds: ["block-result"],
          },
        ],
      },
    ],
  },
  parsingWarnings: [],
});

const claims = [
  {
    id: "claim-result",
    text: "负责上线流程，将交付周期缩短 20%.",
    sourceBlockIds: ["block-result"],
    evidenceAssetIds: ["private-evidence-not-sent"],
    status: "supported" as const,
    confidence: 0.9,
    missingInformation: [],
  },
];

function context(signal?: AbortSignal): CapabilityContext {
  return {
    sessionId: "session-provider-test",
    locale: "zh-CN",
    grantedDataScopes: ["resume_ast", "evidence_graph"],
    traceId: "trace-provider-test",
    deadlineAt: new Date(Date.now() + 5_000).toISOString(),
    signal,
  };
}

function scoreOutput() {
  return ScorecardSchema.parse({
    resumeId: resume.id,
    resumeRevision: resume.revision,
    total: 80,
    dimensions: [
      { id: "impact", label: "成果", score: 20, maxScore: 25, evidence: ["交付周期缩短 20%"], deductions: [] },
      { id: "completeness", label: "完整", score: 12, maxScore: 15, evidence: [], deductions: [] },
      { id: "clarity", label: "清晰", score: 12, maxScore: 15, evidence: [], deductions: [] },
      { id: "structure", label: "结构", score: 12, maxScore: 15, evidence: [], deductions: [] },
      { id: "ats", label: "ATS", score: 12, maxScore: 15, evidence: [], deductions: [] },
      { id: "language", label: "语言", score: 12, maxScore: 15, evidence: [], deductions: [] },
    ],
    summary: "内容基础扎实，建议继续补充可核实影响。",
  });
}

function completionResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(data) } }],
      usage: { prompt_tokens: 120, completion_tokens: 60 },
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function interviewReferenceQuestion(): InterviewQuestion {
  return InterviewQuestionSchema.parse({
    id: "reference-question-delivery",
    locale: "zh-CN",
    prompt: "请说明一次你改善交付流程的经历。",
    category: "behavioral",
    difficulty: "intermediate",
    roleFamilies: ["product"],
    skills: ["交付"],
    followUps: ["你如何核实结果？"],
    scoringAnchors: ["说明个人行动", "使用可核实结果"],
    source: "route-test-pack@1.0.0",
    generated: false,
    referenceQuestionIds: [],
  });
}

function generatedInterviewQuestion(
  index: number,
  overrides: Partial<InterviewQuestion> = {},
): InterviewQuestion {
  const prompts = [
    "面对目标岗位中的跨团队交付挑战，你会如何说明自己的判断依据、具体行动与验证方式？",
    "当项目关键节点出现资源冲突时，你如何权衡优先级，并用哪些证据复盘决策质量？",
  ];
  return InterviewQuestionSchema.parse({
    id: `ai-interview-generated-${index}`,
    locale: "zh-CN",
    prompt: prompts[index - 1] ?? `请说明你处理岗位挑战 ${index} 时采用的判断和验证方法。`,
    category: "role",
    difficulty: "intermediate",
    roleFamilies: ["product"],
    skills: ["交付"],
    followUps: ["哪项证据最能支持你的判断？"],
    scoringAnchors: ["说明个人行动", "使用可核实证据"],
    source: "interview.plan@2.0.0",
    generated: true,
    referenceQuestionIds: ["reference-question-delivery"],
    ...overrides,
  });
}

function interviewPlanInput(questionCount = 1) {
  return {
    locale: "zh-CN" as const,
    role: "产品经理",
    skills: ["交付", "跨团队协作"],
    jobRequirements: ["负责跨团队产品交付与效果复盘"],
    questions: [interviewReferenceQuestion()],
    durationMinutes: 20,
    questionCount,
    maxFollowUpsPerQuestion: 2,
  };
}

function interviewPlanOutput(questions: InterviewQuestion[]) {
  return {
    durationMinutes: 20,
    maxFollowUpsPerQuestion: 2,
    items: questions.map((question, index) => ({
      order: index + 1,
      question,
      targetMinutes: 20 / questions.length,
    })),
  };
}

describe("OpenAI-compatible provider gateway", () => {
  it("describes resume review as a contextual editing task instead of a generic checklist", () => {
    const instruction = providerInstructions["resume.suggest"];

    expect(instruction).toContain("at most 12 suggestions");
    expect(instruction).toContain("positive integer scoreGain");
    expect(instruction).toContain("one complete review batch");
    expect(instruction).toContain("Do not intentionally defer a visible issue");
    expect(instruction).toContain("complete, ready-to-paste replacement sentence");
    expect(instruction).toContain("Do not reuse stock rationales");
    expect(instruction).toContain("do not return use_as_is placeholders");
    expect(instruction).toContain("do not demand a metric when the source contains none");
    expect(instruction).toContain("one-page-first editorial standard");
    expect(instruction).toContain("single-column hierarchy");
    expect(instruction).toContain("never invent facts or silently discard");
  });

  it("forbids personal information in score output", () => {
    const instruction = providerInstructions["resume.score"];

    expect(instruction).toContain("Never output or infer any person's name");
    expect(instruction).toContain("refer only to the resume or candidate generically");
  });

  it("keeps valid AI findings when a sibling is invalid and replaces provider source IDs", async () => {
    const localOriginalText = resume.ast.sections[0].entries[0].bullets[0];
    const originalText = localOriginalText.normalize("NFKC");
    const patchPath = "/sections/0/entries/0/bullets/0";
    const providerResponse = {
      suggestions: [
        {
          claimIds: ["claim-result"],
          kind: "rewrite",
          targetPath: patchPath,
          originalText,
          proposedText: "负责上线流程，将交付周期缩短 99%.",
          rationale: "把结果改成更大的数字。",
          affectedDimensions: ["impact"],
          scoreGain: 5,
          factRisk: "low",
          interviewRisk: "high",
        },
        {
          claimIds: ["claim-result"],
          kind: "rewrite",
          targetPath: patchPath,
          originalText,
          proposedText: "上线流程负责，交付周期缩短 20%.",
          rationale: "把动作与结果并列，减少句中的弱连接词。",
          affectedDimensions: ["clarity"],
          scoreGain: 3,
          factRisk: "none",
          interviewRisk: "none",
        },
      ],
    };
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(providerResponse)),
      logger: () => undefined,
    });

    const result = await registry.invoke<unknown, { suggestions: Suggestion[] }>(
      "resume.suggest",
      { resume, claims },
      context(),
    );

    expect(result.usedFallback).toBe(false);
    expect(result.sourceVersion).toBe("resume.suggest@2.0.0");
    expect(result.data.suggestions).toHaveLength(1);
    expect(result.data.suggestions[0]).toMatchObject({
      id: expect.stringMatching(/^suggestion-ai_/),
      resumeRevision: resume.revision,
      status: "pending",
      originalText: localOriginalText,
      sourceBlockIds: ["block-result"],
      proposedText: "上线流程负责，交付周期缩短 20%.",
      beforeHash: expect.stringMatching(/^hash_/),
      patches: [{ operation: "replace", path: patchPath }],
    });
  });

  it("treats an explicit empty AI suggestion array as enhanced success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completionResponse({ suggestions: [] }));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    const result = await registry.invoke<
      unknown,
      { suggestions: Suggestion[] }
    >("resume.suggest", { resume, claims }, context(), {
      fallbackPolicy: "forbid",
    });

    expect(result.usedFallback).toBe(false);
    expect(result.sourceVersion).toBe("resume.suggest@2.0.0");
    expect(result.data.suggestions).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const providerInput = JSON.parse(request.messages[1].content);
    expect(providerInput.layoutGoal).toMatchObject({
      targetPages: 1,
      sourcePages: resume.pageCount,
      priority: "prefer",
      styleGuideVersion: "resume-design@2026-07-29",
    });
    expect(providerInput.layoutGoal.principles).toContain(
      "Prefer concise one- or two-line bullets and remove repetition before shrinking type.",
    );
  });

  it("retries once with safe rejection codes when every candidate is invalid", async () => {
    const originalText =
      resume.ast.sections[0].entries[0].bullets[0].normalize("NFKC");
    const invalid = {
      suggestions: [
        {
          claimIds: [],
          kind: "rewrite",
          targetPath: "/sections/99/text",
          originalText,
          proposedText: "负责上线流程，将交付周期缩短 20%.",
          rationale: "使用未知路径。",
          affectedDimensions: ["clarity"],
          scoreGain: 1,
          factRisk: "none",
          interviewRisk: "none",
        },
      ],
    };
    const corrected = {
      suggestions: [
        {
          claimIds: ["claim-result"],
          kind: "rewrite",
          targetPath: "/sections/0/entries/0/bullets/0",
          originalText,
          proposedText: "上线流程负责，交付周期缩短 20%.",
          rationale: "调整语序，让动作与结果更直接。",
          affectedDimensions: ["clarity"],
          scoreGain: 1,
          factRisk: "none",
          interviewRisk: "none",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse(invalid))
      .mockResolvedValueOnce(completionResponse(corrected));
    const events: ProviderGatewayLogEvent[] = [];
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: (event) => events.push(event),
    });

    const result = await registry.invoke<
      unknown,
      { suggestions: Suggestion[] }
    >("resume.suggest", { resume, claims }, context(), {
      fallbackPolicy: "forbid",
    });

    expect(result.usedFallback).toBe(false);
    expect(result.data.suggestions).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    );
    expect(secondRequest.messages[0].content).toContain(
      "UNKNOWN_TARGET_PATH",
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attempt: 1,
          outcome: "invalid_response",
          invalidCandidateReasonCounts: { UNKNOWN_TARGET_PATH: 1 },
        }),
        expect.objectContaining({ attempt: 2, outcome: "success" }),
      ]),
    );
  });

  it("rejects AI resume text that contains export-unsafe placeholder characters", async () => {
    const originalText =
      resume.ast.sections[0].entries[0].bullets[0].normalize("NFKC");
    const unsafe = {
      suggestions: [
        {
          claimIds: ["claim-result"],
          kind: "rewrite",
          targetPath: "/sections/0/entries/0/bullets/0",
          originalText,
          proposedText: "□ 上线流程负责，交付周期缩短 20%.",
          rationale: "调整语序并增加一个占位符号。",
          affectedDimensions: ["clarity"],
          scoreGain: 1,
          factRisk: "none",
          interviewRisk: "none",
        },
      ],
    };
    const corrected = {
      suggestions: [
        {
          ...unsafe.suggestions[0],
          proposedText: "上线流程负责，交付周期缩短 20%.",
          rationale: "调整语序，让动作与结果更直接。",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse(unsafe))
      .mockResolvedValueOnce(completionResponse(corrected));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    const result = await registry.invoke<unknown, { suggestions: Suggestion[] }>(
      "resume.suggest",
      { resume, claims },
      context(),
      { fallbackPolicy: "forbid" },
    );

    expect(result.data.suggestions[0]?.proposedText).toBe(
      "上线流程负责，交付周期缩短 20%.",
    );
    const secondRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    );
    expect(secondRequest.messages[0].content).toContain(
      "UNSUPPORTED_EXPORT_CHARACTER",
    );
  });

  it("fails strict AI analysis after exactly two fully invalid generations", async () => {
    const originalText =
      resume.ast.sections[0].entries[0].bullets[0].normalize("NFKC");
    const invalid = {
      suggestions: [
        {
          claimIds: ["claim-result"],
          kind: "rewrite",
          targetPath: "/sections/0/entries/0/bullets/0",
          originalText,
          proposedText: "负责上线流程，将交付周期缩短 99%.",
          rationale: "加入未被原文支持的数字。",
          affectedDimensions: ["impact"],
          scoreGain: 1,
          factRisk: "high",
          interviewRisk: "high",
        },
      ],
    };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(completionResponse(invalid)),
    );
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    await expect(
      registry.invoke("resume.suggest", { resume, claims }, context(), {
        fallbackPolicy: "forbid",
      }),
    ).rejects.toMatchObject({ code: "EXECUTION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates AI findings by target path, rationale, and question", async () => {
    const dedupResume = structuredClone(resume);
    const bullets = Array.from(
      { length: 5 },
      (_, index) => `主要负责第 ${index + 1} 个交付流程.`,
    );
    dedupResume.sourceBlocks = bullets.map((text, index) => ({
      id: `dedup-block-${index}`,
      pageIndex: 0,
      order: index,
      text,
      bbox: { x: 0.1, y: 0.1 + index * 0.1, width: 0.8, height: 0.05 },
      source: "native" as const,
      confidence: 1,
      role: "list-item" as const,
    }));
    const entry = dedupResume.ast.sections[0].entries[0];
    entry.bullets = bullets;
    entry.sourceBlockIds = dedupResume.sourceBlocks.map((block) => block.id);
    dedupResume.ast.sections[0].sourceBlockIds = entry.sourceBlockIds;

    const rewrite = (index: number, rationale: string) => ({
      claimIds: [],
      kind: "rewrite",
      targetPath: `/sections/0/entries/0/bullets/${index}`,
      originalText: bullets[index],
      proposedText: `负责第 ${index + 1} 个交付流程.`,
      rationale,
      affectedDimensions: ["clarity"],
      scoreGain: 1,
      factRisk: "none",
      interviewRisk: "none",
    });
    const proofQuestion = "这项第一名表述是否有可核对的排名材料？";
    const needsProof = (index: number, rationale: string) => ({
      claimIds: [],
      kind: "needs_proof",
      targetPath: `/sections/0/entries/0/bullets/${index}`,
      originalText: bullets[index],
      rationale,
      question: proofQuestion,
      affectedDimensions: ["impact"],
      scoreGain: 1,
      factRisk: "high",
      interviewRisk: "high",
    });
    const providerResponse = {
      suggestions: [
        rewrite(0, "删除第一条中的弱化词。"),
        { ...rewrite(1, "重复目标路径。"), targetPath: rewrite(0, "重复目标路径。").targetPath },
        rewrite(2, "删除第一条中的弱化词。"),
        needsProof(3, "第三条中的绝对化结论缺少依据。"),
        needsProof(4, "第四条中的绝对化结论缺少依据。"),
      ],
    };
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(providerResponse)),
      logger: () => undefined,
    });

    const result = await registry.invoke<unknown, { suggestions: Suggestion[] }>(
      "resume.suggest",
      { resume: dedupResume, claims: [] },
      context(),
    );

    expect(result.usedFallback).toBe(false);
    expect(result.data.suggestions).toHaveLength(2);
    expect(
      result.data.suggestions.map((suggestion) => suggestion.patches[0].path),
    ).toEqual([
      "/sections/0/entries/0/bullets/0",
      "/sections/0/entries/0/bullets/3",
    ]);
  });

  it("keeps the complete validated finding batch for a typical resume", async () => {
    const longResume = structuredClone(resume);
    const bullets = Array.from(
      { length: 14 },
      (_, index) => `主要负责第 ${index + 1} 个交付流程.`,
    );
    longResume.sourceBlocks = bullets.map((text, index) => ({
      id: `bulk-block-${index}`,
      pageIndex: 0,
      order: index,
      text,
      bbox: { x: 0.1, y: 0.03 + index * 0.065, width: 0.8, height: 0.04 },
      source: "native" as const,
      confidence: 1,
      role: "list-item" as const,
    }));
    const entry = longResume.ast.sections[0].entries[0];
    entry.bullets = bullets;
    entry.sourceBlockIds = longResume.sourceBlocks.map((block) => block.id);
    longResume.ast.sections[0].sourceBlockIds = entry.sourceBlockIds;
    const providerResponse = {
      suggestions: bullets.map((originalText, index) => ({
        claimIds: [],
        kind: "rewrite",
        targetPath: `/sections/0/entries/0/bullets/${index}`,
        originalText,
        proposedText: `负责第 ${index + 1} 个交付流程.`,
        rationale: `删除第 ${index + 1} 条中的弱化词“主要”。`,
        affectedDimensions: ["clarity"],
        scoreGain: index + 1,
        factRisk: "none",
        interviewRisk: "none",
      })),
    };
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(providerResponse)),
      logger: () => undefined,
    });

    const result = await registry.invoke<unknown, { suggestions: Suggestion[] }>(
      "resume.suggest",
      { resume: longResume, claims: [], scoreContext: { ...scoreOutput(), total: 72 } },
      context(),
    );

    expect(result.usedFallback).toBe(false);
    expect(result.data.suggestions).toHaveLength(12);
    expect(
      result.data.suggestions.map((suggestion) => suggestion.sourceBlockIds),
    ).toEqual(
      Array.from({ length: 12 }, (_, index) => [`bulk-block-${index}`]),
    );
    expect(
      result.data.suggestions.reduce(
        (sum, suggestion) => sum + suggestion.scoreGain,
        0,
      ),
    ).toBe(28);
  });

  it("uses the default HTTPS allowlist and rejects unapproved bases without echoing them", () => {
    expect(loadProviderGatewayConfig({})).toBeNull();
    expect(loadProviderGatewayConfig({ AI_PROVIDER: "baseline" })).toBeNull();
    expect(() => loadProviderGatewayConfig({ AI_PROVIDER: "typo-provider" })).toThrow(
      expect.objectContaining({ code: "INVALID_PROVIDER" }),
    );
    expect(loadProviderGatewayConfig(providerEnvironment)).toMatchObject({
      baseUrl: "https://yunwu.ai/v1",
      model: "test-model",
    });
    let error: unknown;
    try {
      loadProviderGatewayConfig({ ...providerEnvironment, AI_API_BASE: "https://unapproved.example/v1" });
    } catch (candidate) {
      error = candidate;
    }
    expect(error).toBeInstanceOf(ProviderGatewayConfigurationError);
    expect(error).toMatchObject({ code: "NOT_ALLOWLISTED" });
    expect(String(error)).not.toContain("unapproved.example");
    expect(() => loadProviderGatewayConfig({
      ...providerEnvironment,
      AI_API_BASE: "https://private-gateway.example/v1",
      AI_API_ALLOWLIST: "https://private-gateway.example/v1",
    })).toThrow(expect.objectContaining({ code: "NOT_ALLOWLISTED" }));
  });

  it("authenticates only to /chat/completions and sends a PII-minimized structured DTO", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse(scoreOutput()));
    const logs: ProviderGatewayLogEvent[] = [];
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: (event) => logs.push(event),
    });

    const result = await registry.invoke("resume.score", { resume, claims }, context());

    expect(result.usedFallback).toBe(false);
    expect(result.sourceVersion).toBe("resume.score@2.0.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://yunwu.ai/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-secret-key");
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.response_format).toEqual({ type: "json_object" });
    expect(requestBody).not.toHaveProperty("max_tokens");
    const projected = requestBody.messages[1].content as string;
    expect(projected).toContain("block-result");
    expect(projected).toContain("claim-result");
    expect(projected).not.toContain("Alice Zhang");
    expect(projected).not.toContain("alice@example.com");
    expect(projected).not.toContain("138 0000 0000");
    expect(projected).not.toContain("example.com/alice");
    expect(projected).not.toContain("alice-private-resume.pdf");
    expect(projected).not.toContain("private-evidence-not-sent");
    expect(JSON.stringify(logs)).not.toContain("test-secret-key");
    expect(JSON.stringify(logs)).not.toContain("交付周期");
    expect(logs).toEqual([
      expect.objectContaining({
        capabilityId: "resume.score",
        capabilityVersion: "2.0.0",
        resultCode: "OK",
        usage: { inputUnits: 120, outputUnits: 60 },
      }),
    ]);
  });

  it("retries a score once when an otherwise valid response contains PII", async () => {
    const unsafeScore = scoreOutput();
    unsafeScore.summary = "我与张三在北京市朝阳区合作。";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse(unsafeScore))
      .mockResolvedValueOnce(completionResponse(scoreOutput()));
    const events: ProviderGatewayLogEvent[] = [];
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: (event) => events.push(event),
    });

    const result = await registry.invoke(
      "resume.score",
      { resume, claims },
      context(),
      { fallbackPolicy: "forbid" },
    );

    expect(result).toMatchObject({
      usedFallback: false,
      sourceVersion: "resume.score@2.0.0",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    );
    expect(secondRequest.messages[0].content).toContain("PII_OUTPUT");
    expect(secondRequest).not.toHaveProperty("max_tokens");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attempt: 1,
          outcome: "invalid_response",
          invalidCandidateReasonCounts: { PII_OUTPUT: 1 },
        }),
        expect.objectContaining({ attempt: 2, outcome: "success" }),
      ]),
    );
  });

  it("does not treat role wording in a score as an ambiguous person name", async () => {
    const roleScore = scoreOutput();
    roleScore.summary = "产品经理岗位所需能力说明清楚，建议继续补充可核实影响。";
    const fetchMock = vi.fn().mockResolvedValue(completionResponse(roleScore));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    await expect(
      registry.invoke(
        "resume.score",
        { resume, claims },
        context(),
        { fallbackPolicy: "forbid" },
      ),
    ).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "resume.score@2.0.0",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends the validated score as context in a separate suggestion request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completionResponse({ suggestions: [] }));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    await registry.invoke(
      "resume.suggest",
      { resume, claims, scoreContext: scoreOutput() },
      context(),
      { fallbackPolicy: "forbid" },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const dto = JSON.parse(requestBody.messages[1].content);
    expect(requestBody.response_format).toEqual({ type: "json_object" });
    expect(dto.scoreContext).toMatchObject({
      resumeId: resume.id,
      resumeRevision: resume.revision,
      total: 80,
      summary: "内容基础扎实,建议继续补充可核实影响。",
    });
    expect(requestBody).not.toHaveProperty("max_tokens");
  });

  it("does not scan numeric system identifiers as natural-language PII", async () => {
    const numericIdResume = structuredClone(resume);
    numericIdResume.id = "resume-123456789012";
    const numericIdScore = scoreOutput();
    numericIdScore.resumeId = numericIdResume.id;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completionResponse({ suggestions: [] }));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    await expect(
      registry.invoke(
        "resume.suggest",
        {
          resume: numericIdResume,
          claims,
          scoreContext: numericIdScore,
        },
        context(),
        { fallbackPolicy: "forbid" },
      ),
    ).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "resume.suggest@2.0.0",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("redacts known name variants and addresses from every projected resume string", async () => {
    const piiResume = structuredClone(resume);
    piiResume.ast.contact.location = "上海市浦东新区世纪大道 100 号";
    piiResume.ast.sections[0].entries[0].summary =
      "A L I C E   Z H A N G，ZHANG, ALICE，地址：上海市浦东新区世纪大道 100 号";
    const fetchMock = vi.fn().mockResolvedValue(completionResponse(scoreOutput()));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    const result = await registry.invoke("resume.score", { resume: piiResume, claims }, context());
    expect(result.usedFallback).toBe(false);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const projected = requestBody.messages[1].content as string;
    expect(projected).toContain("[NAME]");
    expect(projected).toContain("[ADDRESS]");
    expect(projected).not.toMatch(/a\s*l\s*i\s*c\s*e/i);
    expect(projected).not.toMatch(/zhang\s*,\s*alice/i);
    expect(projected).not.toContain("世纪大道");
  });

  it("never sends contextual Chinese names or unlabeled administrative addresses in resume, job, or answer DTOs", async () => {
    const captures: string[] = [];
    const captureAndThrottle = vi.fn((_url: string, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      captures.push(requestBody.messages[1].content as string);
      return Promise.resolve(new Response("rate limited", { status: 429 }));
    });
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: captureAndThrottle as typeof fetch,
      logger: () => undefined,
    });
    const privateSentence = "我与张三在北京市朝阳区合作";
    const resumeWithPrivateSentence = structuredClone(resume);
    resumeWithPrivateSentence.ast.sections[0].entries[0].summary = privateSentence;

    await registry.invoke("resume.score", { resume: resumeWithPrivateSentence, claims }, context());
    await registry.invoke("job.match", {
      requirements: [{
        id: "requirement-private-context",
        jobPostingId: "job-private-context",
        category: "responsibility",
        text: privateSentence,
        keywords: ["合作"],
        importance: 1,
      }],
      claims,
      evidenceAssets: [],
    }, {
      ...context(),
      grantedDataScopes: ["job_description", "evidence_graph"],
    });
    const question = {
      id: "question-private-context",
      locale: "zh-CN" as const,
      prompt: "请说明一次合作经历。",
      category: "behavioral" as const,
      difficulty: "introductory" as const,
      roleFamilies: [],
      skills: ["合作"],
      followUps: [],
      scoringAnchors: [],
      source: "test",
      generated: false,
      referenceQuestionIds: [],
    };
    await registry.invoke("answer.evaluate", {
      question,
      answer: `${privateSentence}，并按期完成交付。`,
      expectedKeywords: ["合作"],
    }, {
      ...context(),
      grantedDataScopes: ["interview_content", "evidence_graph"],
    });

    expect(captures).toHaveLength(3);
    expect(captures.every((projected) => projected.includes("[NAME]") && projected.includes("[ADDRESS]"))).toBe(true);
    expect(captures.join("\n")).not.toMatch(/张三|北京市|朝阳区/);
  });

  it("redacts reasonable unlabeled English names and street addresses", async () => {
    const privateResume = structuredClone(resume);
    privateResume.ast.sections[0].entries[0].summary =
      "I worked with John Doe at 123 Main Street, Seattle, WA 98101.";
    const fetchMock = vi.fn().mockResolvedValue(completionResponse(scoreOutput()));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    const result = await registry.invoke("resume.score", { resume: privateResume, claims }, {
      ...context(),
      locale: "en-US",
    });

    expect(result.usedFallback).toBe(false);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const projected = requestBody.messages[1].content as string;
    expect(projected).toContain("[NAME]");
    expect(projected).toContain("[ADDRESS]");
    expect(projected).not.toMatch(/John\s+Doe|Main Street|98101/i);
  });

  it("fails closed before fetch when a contextual name cannot be safely projected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse({}));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });
    const question = {
      id: "question-ambiguous-name",
      locale: "zh-CN" as const,
      prompt: "请说明一次合作经历。",
      category: "behavioral" as const,
      difficulty: "introductory" as const,
      roleFamilies: [],
      skills: [],
      followUps: [],
      scoringAnchors: [],
      source: "test",
      generated: false,
      referenceQuestionIds: [],
    };

    const result = await registry.invoke("answer.evaluate", {
      question,
      answer: "我与阿布都买买提一起完成了交付复盘。",
      expectedKeywords: [],
    }, {
      ...context(),
      grantedDataScopes: ["interview_content", "evidence_graph"],
    });

    expect(result).toMatchObject({
      usedFallback: true,
      sourceVersion: "answer.evaluate@1.0.0",
      warnings: [{ code: "EXTENSION_EXECUTION_FAILED" }],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects provider output that reintroduces a known name in another case or spacing", async () => {
    const unsafeScore = scoreOutput();
    unsafeScore.summary = "A L I C E   Z H A N G has a strong resume.";
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(unsafeScore)),
      logger: () => undefined,
    });

    await expect(registry.invoke("resume.score", { resume, claims }, context())).resolves.toMatchObject({
      usedFallback: true,
      sourceVersion: "resume.score@1.0.0",
    });
  });

  it("rejects provider output containing a new contextual name or address", async () => {
    const unsafeScore = scoreOutput();
    unsafeScore.summary = "我与张三在北京市朝阳区合作。";
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(unsafeScore)),
      logger: () => undefined,
    });

    await expect(registry.invoke("resume.score", { resume, claims }, context())).resolves.toMatchObject({
      usedFallback: true,
      sourceVersion: "resume.score@1.0.0",
      warnings: [{ code: "EXTENSION_EXECUTION_FAILED" }],
    });
  });

  it("rejects provider output containing an ambiguous contextual name", async () => {
    const unsafeScore = scoreOutput();
    unsafeScore.summary = "我与阿布都买买提一起完成了交付复盘。";
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(unsafeScore)),
      logger: () => undefined,
    });

    await expect(registry.invoke("resume.score", { resume, claims }, context())).resolves.toMatchObject({
      usedFallback: true,
      sourceVersion: "resume.score@1.0.0",
    });
  });

  it("redacts conservatively labeled names in JD, claim, and answer projections", async () => {
    const captures: string[] = [];
    const captureAndThrottle = vi.fn((_url: string, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      captures.push(requestBody.messages[1].content as string);
      return Promise.resolve(new Response("rate limited", { status: 429 }));
    });
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: captureAndThrottle as typeof fetch,
      logger: () => undefined,
    });
    const jdText = "产品经理\n联系人姓名：张三\n要求熟悉 SQL 和用户研究";
    await registry.invoke("jd.parse", { text: jdText, locale: "zh-CN" }, {
      ...context(),
      grantedDataScopes: ["job_description"],
    });
    await registry.invoke("job.match", {
      requirements: [{
        id: "requirement-name-projection",
        jobPostingId: "job-name-projection",
        category: "skill",
        text: "要求熟悉 Kubernetes",
        keywords: ["kubernetes"],
        importance: 1,
      }],
      claims: [{
        ...claims[0],
        text: "姓名：李四，熟悉 Kubernetes",
      }],
      evidenceAssets: [],
    }, {
      ...context(),
      grantedDataScopes: ["job_description", "evidence_graph"],
    });
    const question = {
      id: "question-name-projection",
      locale: "en-US" as const,
      prompt: "Introduce yourself and describe a delivery result.",
      category: "behavioral" as const,
      difficulty: "introductory" as const,
      roleFamilies: [],
      skills: ["delivery"],
      followUps: [],
      scoringAnchors: [],
      source: "test",
      generated: false,
      referenceQuestionIds: [],
    };
    await registry.invoke("answer.evaluate", {
      question,
      answer: "My name is John Doe. I improved delivery quality through weekly reviews.",
      expectedKeywords: [],
    }, {
      ...context(),
      locale: "en-US",
      grantedDataScopes: ["interview_content", "evidence_graph"],
    });

    expect(captures).toHaveLength(3);
    expect(captures.every((projected) => projected.includes("[NAME]"))).toBe(true);
    expect(captures.join("\n")).not.toMatch(/张三|李四|John\s+Doe/i);
  });

  it("retries exactly once with json_object only when JSON Schema is explicitly unsupported", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "response_format json_schema is not supported" } }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(completionResponse({ ok: true }));
    const config = loadProviderGatewayConfig(providerEnvironment)!;
    const gateway = new OpenAiCompatibleGateway(config, fetchMock, () => undefined);

    const result = await gateway.complete({
      capabilityId: "copy.rewrite.zh",
      context: context(),
      dto: { safe: "input" },
      outputSchema: z.object({ ok: z.boolean() }),
      instruction: "Return the fixture.",
    });

    expect(result.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).response_format.type).toBe("json_schema");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).response_format.type).toBe("json_object");
  });

  it("retries one transport failure when the capability deadline has enough budget", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(completionResponse({ ok: true }));
      const events: ProviderGatewayLogEvent[] = [];
      const gateway = new OpenAiCompatibleGateway(
        loadProviderGatewayConfig(providerEnvironment)!,
        fetchMock,
        (event) => events.push(event),
      );
      const invocation = gateway.complete({
        capabilityId: "resume.score",
        context: {
          ...context(),
          deadlineAt: new Date(Date.now() + 60_000).toISOString(),
        },
        dto: { safe: "input" },
        outputSchema: z.object({ ok: z.boolean() }),
        instruction: "Return the fixture.",
      });

      await vi.advanceTimersByTimeAsync(1_001);

      await expect(invocation).resolves.toMatchObject({ data: { ok: true } });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(events).toEqual([
        expect.objectContaining({
          outcome: "network_error",
          transportAttempt: 1,
        }),
        expect.objectContaining({
          outcome: "success",
          transportAttempt: 2,
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a 429 even when its body mentions response_format", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message:
              "Invalid schema for response_format 'resume_score': required is missing.",
            type: "rate_limit_error",
            param: "response_format",
            code: "rate_limited",
          },
        }),
        { status: 429 },
      ),
    );
    const gateway = new OpenAiCompatibleGateway(
      loadProviderGatewayConfig(providerEnvironment)!,
      fetchMock,
      () => undefined,
    );

    await expect(
      gateway.complete({
        capabilityId: "copy.rewrite.zh",
        context: context(),
        dto: { safe: "input" },
        outputSchema: z.object({ ok: z.boolean() }),
        instruction: "Return the fixture.",
      }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR", status: 429 });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("cancels an unbounded response stream as soon as it exceeds two megabytes", async () => {
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024);
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.enqueue(new Uint8Array([1]));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200 },
    );
    expect(response.headers.get("content-length")).toBeNull();
    const gateway = new OpenAiCompatibleGateway(
      loadProviderGatewayConfig(providerEnvironment)!,
      vi.fn().mockResolvedValue(response),
      () => undefined,
    );

    await expect(
      gateway.complete({
        capabilityId: "resume.score",
        context: context(),
        dto: { safe: "input" },
        outputSchema: z.object({ ok: z.boolean() }),
        instruction: "Return the fixture.",
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(cancelled).toBe(true);
  });

  it("falls back to the baseline for 429 and Zod-valid but fact-unsafe suggestions", async () => {
    const throttledRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })),
      logger: () => undefined,
    });
    const throttled = await throttledRegistry.invoke("resume.score", { resume, claims }, context());
    expect(throttled.usedFallback).toBe(true);
    expect(throttled.sourceVersion).toBe("resume.score@1.0.0");

    const unsafeSuggestion = {
      suggestions: [
        {
          id: "provider-suggestion",
          resumeRevision: resume.revision,
          sourceBlockIds: ["block-result"],
          claimIds: ["claim-result"],
          kind: "rewrite",
          status: "pending",
          originalText: "负责上线流程，将交付周期缩短 20%.",
          proposedText: "负责上线流程，将交付周期缩短 99%.",
          rationale: "强化结果表达。",
          beforeHash: "provider-hash",
          patches: [
            {
              operation: "replace",
              path: "/sections/0/entries/0/bullets/0",
              value: "负责上线流程，将交付周期缩短 99%.",
            },
          ],
          affectedDimensions: ["impact"],
          scoreGain: 1,
          factRisk: "low",
          interviewRisk: "high",
        },
      ],
    };
    const unsafeRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(unsafeSuggestion)),
      logger: () => undefined,
    });
    const unsafe = await unsafeRegistry.invoke("resume.suggest", { resume, claims }, context());
    expect(unsafe.usedFallback).toBe(true);
    expect(unsafe.sourceVersion).toBe("resume.suggest@1.0.0");
    expect(unsafe.warnings[0].code).toBe("EXTENSION_EXECUTION_FAILED");
  });

  it("does not let a claim from another block support facts added to the target block", async () => {
    const crossBlockResume = structuredClone(resume);
    crossBlockResume.sourceBlocks.push({
      id: "block-other",
      pageIndex: 0,
      order: 2,
      text: "另一个项目实现成本降低 30%.",
      bbox: { x: 0.1, y: 0.3, width: 0.8, height: 0.05 },
      source: "native",
      confidence: 1,
      role: "list-item",
    });
    crossBlockResume.ast.sections.push({
      id: "projects",
      type: "projects",
      title: "项目经历",
      sourceBlockIds: ["block-other"],
      entries: [],
    });
    const crossClaims = [
      ...claims,
      {
        id: "claim-other",
        text: "另一个项目实现成本降低 30%.",
        sourceBlockIds: ["block-other"],
        evidenceAssetIds: [],
        status: "supported" as const,
        confidence: 0.9,
        missingInformation: [],
      },
    ];
    const response = {
      suggestions: [
        {
          id: "provider-cross-block",
          resumeRevision: resume.revision,
          sourceBlockIds: ["block-result"],
          claimIds: ["claim-other"],
          kind: "rewrite",
          status: "pending",
          originalText: "负责上线流程，将交付周期缩短 20%.",
          proposedText: "负责上线流程，将交付周期缩短 20%，并降低成本 30%.",
          rationale: "增加结果。",
          beforeHash: "provider-hash",
          patches: [{
            operation: "replace",
            path: "/sections/0/entries/0/bullets/0",
            value: "负责上线流程，将交付周期缩短 20%，并降低成本 30%.",
          }],
          affectedDimensions: ["impact"],
          scoreGain: 1,
          factRisk: "low",
          interviewRisk: "high",
        },
      ],
    };
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(response)),
      logger: () => undefined,
    });

    await expect(
      registry.invoke("resume.suggest", { resume: crossBlockResume, claims: crossClaims }, context()),
    ).resolves.toMatchObject({ usedFallback: true, sourceVersion: "resume.suggest@1.0.0" });
  });

  it("filters ungrounded score evidence and caps scores at their dimension maximum", async () => {
    const invalidScore = scoreOutput();
    invalidScore.dimensions[0].score = 26;
    invalidScore.dimensions[0].evidence = ["从未出现在简历中的亿元营收成果"];
    invalidScore.total = 86;
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(invalidScore)),
      logger: () => undefined,
    });

    await expect(registry.invoke("resume.score", { resume, claims }, context())).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "resume.score@2.0.0",
      data: {
        total: 85,
        dimensions: [
          expect.objectContaining({ id: "impact", score: 25, evidence: [] }),
          ...invalidScore.dimensions.slice(1).map((dimension) =>
            expect.objectContaining({ id: dimension.id }),
          ),
        ],
      },
    });
  });

  it("normalizes provider-owned score metadata without limiting generated text", async () => {
    const providerScore = scoreOutput();
    providerScore.resumeId = "provider-invented-resume-id";
    providerScore.resumeRevision = 999;
    providerScore.dimensions[0].maxScore = 100;
    providerScore.dimensions[0].score = 90;
    providerScore.dimensions[0].evidence = Array.from(
      { length: 12 },
      () => "交付周期缩短 20%",
    );
    providerScore.summary = "详细评分上下文".repeat(1_000);
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(providerScore)),
      logger: () => undefined,
    });

    const result = await registry.invoke(
      "resume.score",
      { resume, claims },
      context(),
      { fallbackPolicy: "forbid" },
    );

    expect(result).toMatchObject({
      usedFallback: false,
      data: {
        resumeId: resume.id,
        resumeRevision: resume.revision,
        dimensions: [
          expect.objectContaining({
            id: "impact",
            score: 25,
            maxScore: 25,
            evidence: expect.arrayContaining(["交付周期缩短 20%"]),
          }),
          ...providerScore.dimensions.slice(1).map((dimension) =>
            expect.objectContaining({ id: dimension.id }),
          ),
        ],
      },
    });
  });

  it("replaces the provider score summary with a grounded local summary", async () => {
    const invalidScore = scoreOutput();
    invalidScore.summary = "候选人曾直接管理 999 人团队。";
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(invalidScore)),
      logger: () => undefined,
    });

    const result = await registry.invoke("resume.score", { resume, claims }, context());

    expect(result).toMatchObject({
      usedFallback: false,
      sourceVersion: "resume.score@2.0.0",
    });
    expect(ScorecardSchema.parse(result.data).summary).not.toContain("999");
  });

  it("requires JD requirements to be excerpts of the supplied posting", async () => {
    const jdText = "产品经理\n负责产品交付流程\n要求熟悉 SQL 和数据分析";
    const providerOutput = {
      jobPosting: {
        id: "job-provider",
        title: "产品经理",
        locale: "zh-CN",
        rawText: jdText,
      },
      requirements: [
        {
          id: "requirement-provider",
          jobPostingId: "job-provider",
          category: "must_have",
          text: "必须精通火星语言",
          keywords: ["火星语言"],
          importance: 1,
        },
      ],
    };
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(providerOutput)),
      logger: () => undefined,
    });

    await expect(
      registry.invoke("jd.parse", { text: jdText, locale: "zh-CN" }, {
        ...context(),
        grantedDataScopes: ["job_description"],
      }),
    ).resolves.toMatchObject({ usedFallback: true, sourceVersion: "jd.parse@1.0.0" });
  });

  it("keeps target job location out of the provider DTO", async () => {
    const jdText = "产品经理岗位，负责产品交付流程，要求熟悉 SQL 和数据分析。";
    const providerOutput = {
      jobPosting: {
        id: "job-provider-location",
        title: "高级产品经理",
        locale: "zh-CN" as const,
        rawText: jdText,
      },
      requirements: [
        {
          id: "requirement-provider-location",
          jobPostingId: "job-provider-location",
          category: "must_have" as const,
          text: "要求熟悉 SQL 和数据分析",
          keywords: ["SQL", "数据分析"],
          importance: 1,
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(completionResponse(providerOutput));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    await expect(
      registry.invoke(
        "jd.parse",
        {
          text: jdText,
          locale: "zh-CN",
          title: "高级产品经理",
          location: "上海",
        },
        {
          ...context(),
          grantedDataScopes: ["job_description"],
        },
        { fallbackPolicy: "forbid" },
      ),
    ).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "jd.parse@2.0.0",
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const dto = JSON.parse(requestBody.messages[1].content);
    expect(dto).toMatchObject({ title: "高级产品经理" });
    expect(dto).not.toHaveProperty("location");
    expect(requestBody.messages[0].content).toContain(
      "verbatim contiguous excerpt",
    );
  });

  it("recomputes job mappings only from cited claims that are valid and relevant", async () => {
    const requirements = [{
      id: "requirement-kubernetes",
      jobPostingId: "job-kubernetes",
      category: "must_have" as const,
      text: "要求熟悉 Kubernetes 集群运维",
      keywords: ["kubernetes", "集群运维"],
      importance: 1,
    }];
    const providerOutput = {
      evidenceCoverageRate: 100,
      maps: [{
        requirementId: "requirement-kubernetes",
        status: "met",
        claimIds: ["claim-result"],
        evidenceAssetIds: [],
        explanation: "完全匹配。",
        confidence: 0.99,
      }],
      disclaimer: "match",
    };
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(providerOutput)),
      logger: () => undefined,
    });

    await expect(
      registry.invoke("job.match", { requirements, claims, evidenceAssets: [] }, {
        ...context(),
        grantedDataScopes: ["job_description", "evidence_graph"],
      }),
    ).resolves.toMatchObject({ usedFallback: true, sourceVersion: "job.match@1.0.0" });
  });

  it("preserves grounded requirement-specific AI mapping explanations", async () => {
    const requirements = [{
      id: "requirement-delivery",
      jobPostingId: "job-delivery",
      category: "responsibility" as const,
      text: "负责优化产品上线交付流程",
      keywords: ["交付", "流程"],
      importance: 0.8,
    }];
    const explanation =
      "简历提到上线流程和交付周期，但没有说明覆盖完整产品交付流程的职责范围。";
    const suggestedAction =
      "如有真实经历，补充本人负责的具体流程环节和可核实结果。";
    const fetchMock = vi.fn().mockResolvedValue(completionResponse({
      evidenceCoverageRate: 100,
      maps: [{
        requirementId: requirements[0].id,
        status: "partial",
        claimIds: [claims[0].id],
        evidenceAssetIds: [],
        explanation,
        confidence: 0.84,
        suggestedAction,
      }],
      disclaimer: "provider disclaimer",
    }));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    await expect(
      registry.invoke(
        "job.match",
        { requirements, claims, evidenceAssets: [] },
        {
          ...context(),
          grantedDataScopes: ["job_description", "evidence_graph"],
        },
      ),
    ).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "job.match@2.0.0",
      data: {
        evidenceCoverageRate: 50,
        maps: [{
          status: "partial",
          explanation,
          suggestedAction,
        }],
      },
    });
    expect(
      JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).response_format.type,
    ).toBe("json_object");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const dto = JSON.parse(requestBody.messages[1].content);
    expect(dto.requirements[0].eligibleClaimIds).toEqual([claims[0].id]);
    expect(requestBody.messages[0].content).toContain("eligibleClaimIds");
  });

  it("still rejects direct contextual names in job-match output", async () => {
    const requirements = [{
      id: "requirement-private-output",
      jobPostingId: "job-private-output",
      category: "responsibility" as const,
      text: "负责优化产品上线交付流程",
      keywords: ["交付", "流程"],
      importance: 1,
    }];
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse({
        evidenceCoverageRate: 50,
        maps: [{
          requirementId: requirements[0].id,
          status: "partial",
          claimIds: [claims[0].id],
          evidenceAssetIds: [],
          explanation: "我与张三合作核对了这项经历。",
          confidence: 0.8,
        }],
        disclaimer: "仅表示证据覆盖程度。",
      })),
      logger: () => undefined,
    });

    await expect(
      registry.invoke(
        "job.match",
        { requirements, claims, evidenceAssets: [] },
        {
          ...context(),
          grantedDataScopes: ["job_description", "evidence_graph"],
        },
      ),
    ).resolves.toMatchObject({
      usedFallback: true,
      sourceVersion: "job.match@1.0.0",
    });
  });

  it("uses json_object for required interview planning and coaching", async () => {
    const question = generatedInterviewQuestion(1, { id: "plan-q-20260728-001" });
    const planInput = interviewPlanInput();
    const answer = "我梳理了交付流程，并通过复盘减少等待，最终按期上线。";
    const evaluation = {
      questionId: question.id,
      overallScore: 50,
      dimensions: {
        relevance: 10,
        structure: 10,
        evidence: 10,
        roleCompetency: 10,
        clarity: 10,
      },
      strengths: ["回答直接"],
      improvements: ["补充核实方式"],
      citedAnswerFragments: ["按期上线"],
      followUpQuestion: "你如何核实结果？",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        completionResponse(interviewPlanOutput([question])),
      )
      .mockResolvedValueOnce(
        completionResponse({
          headline: "先说明个人行动，再补充结果的核实方式。",
          actions: ["说明如何识别等待节点。"],
          improvedOutline: ["交代流程问题", "说明个人行动", "给出可核实结果"],
          factSafetyReminder: "只使用真实且可核实的信息。",
        }),
      );
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    const planningResult = await registry.invoke<
      unknown,
      { items: Array<{ question: InterviewQuestion }> }
    >(
      "interview.plan",
      planInput,
      {
        ...context(),
        grantedDataScopes: ["anonymous_metadata"],
      },
      { fallbackPolicy: "forbid" },
    );
    expect(planningResult).toMatchObject({
      usedFallback: false,
      sourceVersion: "interview.plan@2.0.0",
      data: {
        items: [{ question: { id: expect.stringMatching(/^interview_ai_a_/), generated: true } }],
      },
    });
    expect(planningResult.data.items[0].question.id).not.toMatch(/\d/);
    const plannedQuestion = planningResult.data.items[0].question;
    await expect(
      registry.invoke(
        "answer.coach",
        {
          question: plannedQuestion,
          answer,
          evaluation: { ...evaluation, questionId: plannedQuestion.id },
        },
        {
          ...context(),
          grantedDataScopes: ["interview_content", "evidence_graph"],
        },
        { fallbackPolicy: "forbid" },
      ),
    ).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "answer.coach@2.0.0",
    });

    const requests = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)),
    );
    expect(requests).toHaveLength(2);
    expect(
      requests.every(
        (request) => request.response_format.type === "json_object",
      ),
    ).toBe(true);
    const planningDto = JSON.parse(requests[0].messages[1].content);
    expect(planningDto).toMatchObject({
      locale: "zh-CN",
      role: "产品经理",
      skills: ["交付", "跨团队协作"],
      jobRequirements: ["负责跨团队产品交付与效果复盘"],
    });
    expect(planningDto).toHaveProperty("referenceQuestions");
    expect(planningDto).not.toHaveProperty("questions");
    expect(requests[0].messages[0].content).toContain("context only");
  });

  it.each([
    {
      name: "a reused local question id",
      questions: [generatedInterviewQuestion(1, { id: "reference-question-delivery" })],
    },
    {
      name: "a verbatim local prompt",
      questions: [generatedInterviewQuestion(1, { prompt: interviewReferenceQuestion().prompt })],
    },
    {
      name: "missing reference ids",
      questions: [generatedInterviewQuestion(1, { referenceQuestionIds: [] })],
    },
    {
      name: "an unknown reference id",
      questions: [generatedInterviewQuestion(1, { referenceQuestionIds: ["unknown-reference"] })],
    },
    {
      name: "generated false",
      questions: [generatedInterviewQuestion(1, { generated: false })],
    },
    {
      name: "the wrong locale",
      questions: [generatedInterviewQuestion(1, {
        locale: "en-US",
        prompt: "How would you explain your decision criteria and verify the outcome?",
      })],
    },
    {
      name: "PII in generated text",
      questions: [generatedInterviewQuestion(1, {
        prompt: "请联系 candidate@example.com 后再说明你会如何验证产品改进效果。",
      })],
    },
    {
      name: "duplicate generated ids",
      questions: [
        generatedInterviewQuestion(1),
        generatedInterviewQuestion(2, { id: "ai-interview-generated-1" }),
      ],
    },
    {
      name: "duplicate generated prompts",
      questions: [
        generatedInterviewQuestion(1),
        generatedInterviewQuestion(2, { prompt: generatedInterviewQuestion(1).prompt }),
      ],
    },
  ])("rejects interview plans containing $name", async ({ questions }) => {
    const output = interviewPlanOutput(questions);
    const fetchMock = vi.fn().mockImplementation(async () => completionResponse(output));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    await expect(
      registry.invoke(
        "interview.plan",
        interviewPlanInput(questions.length),
        {
          ...context(),
          grantedDataScopes: ["anonymous_metadata"],
        },
        { fallbackPolicy: "forbid" },
      ),
    ).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("normalizes derived answer scores and rejects unsafe evaluation or coaching output", async () => {
    const question = {
      id: "question-provider",
      locale: "zh-CN" as const,
      prompt: "请说明一次你改善交付流程的经历。",
      category: "behavioral" as const,
      difficulty: "intermediate" as const,
      roleFamilies: [],
      skills: ["交付"],
      followUps: ["结果如何核实？"],
      scoringAnchors: [],
      source: "test",
      generated: false,
      referenceQuestionIds: [],
    };
    const answer = "我负责梳理交付流程，并通过复盘降低等待时间，最终按期上线。";
    const inconsistentEvaluation = {
      questionId: question.id,
      overallScore: 99,
      dimensions: { relevance: 10, structure: 10, evidence: 10, roleCompetency: 10, clarity: 10 },
      strengths: [],
      improvements: [],
      citedAnswerFragments: ["按期上线"],
      followUpQuestion: "结果如何核实？",
    };
    const evaluationRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(inconsistentEvaluation)),
      logger: () => undefined,
    });
    await expect(
      evaluationRegistry.invoke("answer.evaluate", { question, answer, expectedKeywords: [] }, {
        ...context(),
        grantedDataScopes: ["interview_content", "evidence_graph"],
      }),
    ).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "answer.evaluate@2.0.0",
      data: { overallScore: 50 },
    });

    const emptyCitationRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse({
        ...inconsistentEvaluation,
        overallScore: 50,
        citedAnswerFragments: [""],
      })),
      logger: () => undefined,
    });
    await expect(
      emptyCitationRegistry.invoke("answer.evaluate", { question, answer, expectedKeywords: [] }, {
        ...context(),
        grantedDataScopes: ["interview_content", "evidence_graph"],
      }),
    ).resolves.toMatchObject({ usedFallback: true, sourceVersion: "answer.evaluate@1.0.0" });

    const directNameRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse({
        ...inconsistentEvaluation,
        overallScore: 50,
        strengths: ["我与张三合作核对了回答。"],
      })),
      logger: () => undefined,
    });
    await expect(
      directNameRegistry.invoke("answer.evaluate", { question, answer, expectedKeywords: [] }, {
        ...context(),
        grantedDataScopes: ["interview_content", "evidence_graph"],
      }),
    ).resolves.toMatchObject({
      usedFallback: true,
      sourceVersion: "answer.evaluate@1.0.0",
    });

    const dynamicFollowUp = {
      ...inconsistentEvaluation,
      overallScore: 50,
      followUpQuestion: "你具体如何定位流程中的等待节点？",
    };
    const dynamicFollowUpFetch = vi.fn().mockResolvedValue(completionResponse(dynamicFollowUp));
    const dynamicFollowUpRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: dynamicFollowUpFetch,
      logger: () => undefined,
    });
    await expect(
      dynamicFollowUpRegistry.invoke("answer.evaluate", { question, answer, expectedKeywords: [] }, {
        ...context(),
        grantedDataScopes: ["interview_content", "evidence_graph"],
      }),
    ).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "answer.evaluate@2.0.0",
      data: { followUpQuestion: dynamicFollowUp.followUpQuestion },
    });
    expect(JSON.parse(String(dynamicFollowUpFetch.mock.calls[0][1]?.body)).response_format.type).toBe("json_object");

    const validEvaluation = { ...inconsistentEvaluation, overallScore: 50 };
    const unsafeCoaching = {
      headline: "建议安排 30 天强化训练",
      actions: ["补充清晰行动"],
      improvedOutline: ["说明背景", "说明结果"],
      factSafetyReminder: "只使用真实且可核实的信息。",
    };
    const coachingRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse(unsafeCoaching)),
      logger: () => undefined,
    });
    await expect(
      coachingRegistry.invoke("answer.coach", { question, answer, evaluation: validEvaluation }, {
        ...context(),
        grantedDataScopes: ["interview_content", "evidence_graph"],
      }),
    ).resolves.toMatchObject({ usedFallback: true, sourceVersion: "answer.coach@1.0.0" });
  });

  it("enhances Chinese and English copy rewrites through minimized structured DTOs", async () => {
    const zhInput = {
      text: "主要负责 TypeScript 平台交付，将周期缩短 20%.",
      preserveTerms: ["TypeScript"],
    };
    const enInput = {
      text: "Was responsible for the TypeScript platform, reducing cycle time by 20%.",
      preserveTerms: ["TypeScript"],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse({
        original: zhInput.text.normalize("NFKC"),
        rewritten: "负责 TypeScript 平台交付，将周期缩短 20%.",
        changes: ["删除弱化表达"],
        addedFacts: false,
      }))
      .mockResolvedValueOnce(completionResponse({
        original: enInput.text,
        rewritten: "Responsible for the TypeScript platform, reducing cycle time by 20%.",
        changes: ["Removed passive auxiliary wording"],
        addedFacts: false,
      }));
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock,
      logger: () => undefined,
    });

    await expect(registry.invoke("copy.rewrite.zh", zhInput, context())).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "copy.rewrite.zh@2.0.0",
      data: { original: zhInput.text, rewritten: "负责 TypeScript 平台交付，将周期缩短 20%." },
    });
    await expect(registry.invoke("copy.rewrite.en", enInput, {
      ...context(),
      locale: "en-US",
    })).resolves.toMatchObject({
      usedFallback: false,
      sourceVersion: "copy.rewrite.en@2.0.0",
      data: { original: enInput.text, rewritten: "Responsible for the TypeScript platform, reducing cycle time by 20%." },
    });

    const requests = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(requests.map((request) => JSON.parse(request.messages[1].content))).toEqual([
      { ...zhInput, text: zhInput.text.normalize("NFKC") },
      enInput,
    ]);
    expect(requests.every((request) => request.response_format.type === "json_schema")).toBe(true);
  });

  it("falls back when a copy rewrite adds facts, drops protected terms, or contains redacted PII", async () => {
    const unsafeFactRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse({
        original: "负责平台交付",
        rewritten: "负责平台交付，覆盖 100 万用户并获得行业第一",
        changes: ["增加结果"],
        addedFacts: false,
      })),
      logger: () => undefined,
    });
    await expect(
      unsafeFactRegistry.invoke(
        "copy.rewrite.zh",
        { text: "负责平台交付", preserveTerms: [] },
        context(),
      ),
    ).resolves.toMatchObject({
      usedFallback: true,
      sourceVersion: "copy.rewrite.zh@1.0.0",
      data: { rewritten: "负责平台交付", addedFacts: false },
    });

    const missingTermRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(completionResponse({
        original: "Built the TypeScript platform.",
        rewritten: "Built the platform.",
        changes: ["Shortened the sentence"],
        addedFacts: false,
      })),
      logger: () => undefined,
    });
    await expect(
      missingTermRegistry.invoke(
        "copy.rewrite.en",
        { text: "Built the TypeScript platform.", preserveTerms: ["TypeScript"] },
        { ...context(), locale: "en-US" },
      ),
    ).resolves.toMatchObject({ usedFallback: true, sourceVersion: "copy.rewrite.en@1.0.0" });

    const piiFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      const projected = JSON.parse(request.messages[1].content);
      return Promise.resolve(completionResponse({
        original: projected.text,
        rewritten: projected.text,
        changes: [],
        addedFacts: false,
      }));
    });
    const piiRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: piiFetch as typeof fetch,
      logger: () => undefined,
    });
    const privateText = "负责平台交付，可联系 alice@example.com";
    const piiResult = await piiRegistry.invoke(
      "copy.rewrite.zh",
      { text: privateText, preserveTerms: [] },
      context(),
    );
    const piiRequest = JSON.parse(String(piiFetch.mock.calls[0][1]?.body));
    expect(piiRequest.messages[1].content).toContain("[EMAIL]");
    expect(piiRequest.messages[1].content).not.toContain("alice@example.com");
    expect(piiResult).toMatchObject({
      usedFallback: true,
      sourceVersion: "copy.rewrite.zh@1.0.0",
      data: { original: privateText, rewritten: privateText },
    });

    const unsafeCharacterRegistry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn().mockResolvedValue(
        completionResponse({
          original: "负责平台交付",
          rewritten: "负责平台□交付",
          changes: ["加入占位符号"],
          addedFacts: false,
        }),
      ),
      logger: () => undefined,
    });
    await expect(
      unsafeCharacterRegistry.invoke(
        "copy.rewrite.zh",
        { text: "负责平台交付", preserveTerms: [] },
        context(),
      ),
    ).resolves.toMatchObject({
      usedFallback: true,
      sourceVersion: "copy.rewrite.zh@1.0.0",
      data: { rewritten: "负责平台交付" },
    });
  });

  it("falls back to the baseline when the provider exceeds its capability timeout", async () => {
    vi.useFakeTimers();
    try {
      const registry = createServerCapabilityRegistry({
        environment: providerEnvironment,
        fetchImpl: vi.fn(() => new Promise<Response>(() => undefined)),
        logger: () => undefined,
      });
      const invocation = registry.invoke(
        "resume.score",
        { resume, claims },
        {
          ...context(),
          deadlineAt: new Date(Date.now() + 15_000).toISOString(),
        },
      );
      await vi.advanceTimersByTimeAsync(13_001);

      await expect(invocation).resolves.toMatchObject({
        usedFallback: true,
        sourceVersion: "resume.score@1.0.0",
        warnings: [{ code: "EXTENSION_TIMEOUT" }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates user cancellation without invoking the baseline fallback", async () => {
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      markStarted();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted", "AbortError")),
          { once: true },
        );
      });
    });
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: fetchMock as typeof fetch,
      logger: () => undefined,
    });
    const controller = new AbortController();
    const invocation = registry.invoke("resume.score", { resume, claims }, context(controller.signal));
    await started;
    controller.abort();

    await expect(invocation).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exposes only generic availability and keeps secrets out of client modules", async () => {
    const registry = createServerCapabilityRegistry({
      environment: providerEnvironment,
      fetchImpl: vi.fn(),
      logger: () => undefined,
    });
    expect(registry.getFeatureAvailability().find((item) => item.id === "resume.score")).toMatchObject({
      mode: "enhanced",
      available: true,
      fallbackAvailable: true,
    });
    expect(registry.getFeatureAvailability().find((item) => item.id === "resume.atsAudit")).toMatchObject({
      mode: "baseline",
    });
    expect(registry.getFeatureAvailability().find((item) => item.id === "copy.rewrite.zh")).toMatchObject({
      mode: "enhanced",
      available: true,
      fallbackAvailable: true,
    });
    expect(registry.getFeatureAvailability().find((item) => item.id === "copy.rewrite.en")).toMatchObject({
      mode: "enhanced",
      available: true,
      fallbackAvailable: true,
    });
    expect(JSON.stringify(registry.getFeatureAvailability())).not.toMatch(/yunwu|test-model|test-secret-key/i);

    const clientFiles = [
      "src/lib/client/api.ts",
      "src/lib/client/store.ts",
      "src/components/app.tsx",
    ];
    const clientSource = (
      await Promise.all(clientFiles.map((file) => readFile(path.join(process.cwd(), file), "utf8")))
    ).join("\n");
    expect(clientSource).not.toContain("AI_API_KEY");
    expect(clientSource).not.toContain("provider-gateway");
    expect(clientSource).not.toContain("capability-runtime");
  });
});
