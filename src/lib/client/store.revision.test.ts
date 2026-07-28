// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  analyzeResumeRevision: vi.fn(),
}));

vi.mock("./api", () => ({
  analyzeResumeRevision: apiMocks.analyzeResumeRevision,
}));

import {
  ResumeASTSchema,
  SuggestionSchema,
  type ScoreDimensionId,
} from "@/lib/domain";
import { stableId } from "@/lib/baseline/utils";
import type {
  AnalysisBundle,
  EvaluationResponse,
  InterviewPlan,
  JobMatchBundle,
  RenderResponse,
} from "./contracts";
import { SESSION_STORAGE_KEY_V3, useAppStore } from "./store";

const ast = ResumeASTSchema.parse({
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
          current: false,
          bullets: ["负责平台开发"],
          keywords: ["平台"],
          sourceBlockIds: ["block-1"],
        },
      ],
    },
  ],
});

const dimensionIds: ScoreDimensionId[] = [
  "impact",
  "completeness",
  "clarity",
  "structure",
  "ats",
  "language",
];

function analysisFixture(revision = 0, proofRequired = false): AnalysisBundle {
  const suggestion = SuggestionSchema.parse({
    id: "suggestion-1",
    resumeRevision: revision,
    sourceBlockIds: ["block-1"],
    claimIds: proofRequired ? ["claim-1"] : [],
    kind: proofRequired ? "needs_proof" : "rewrite",
    status: "pending",
    originalText: "负责平台开发",
    proposedText: proofRequired ? undefined : "负责核心平台开发",
    rationale: "让职责表达更具体。",
    beforeHash: stableId("hash", "负责平台开发"),
    patches: [
      {
        operation: "replace",
        path: "/sections/0/entries/0/bullets/0",
        value: proofRequired ? "待用户确认" : "负责核心平台开发",
      },
    ],
    affectedDimensions: ["clarity"],
    factRisk: proofRequired ? "high" : "none",
    interviewRisk: proofRequired ? "high" : "none",
  });
  return {
    resume: {
      id: "resume-1",
      revision,
      originalFileName: "resume.pdf",
      mimeType: "application/pdf",
      locale: "zh-CN",
      pageCount: 1,
      parseMethod: "native",
      sourceBlocks: [],
      ast: structuredClone(ast),
      parsingWarnings: [],
    },
    evidence: [],
    claims: proofRequired
      ? [
          {
            id: "claim-1",
            text: "负责平台开发",
            sourceBlockIds: ["block-1"],
            evidenceAssetIds: [],
            status: "needs_evidence",
            confidence: 0.5,
            missingInformation: ["具体结果"],
          },
        ]
      : [],
    scorecard: {
      resumeId: "resume-1",
      resumeRevision: revision,
      total: 60,
      dimensions: dimensionIds.map((id) => ({
        id,
        label: id,
        score: 10,
        maxScore: 20,
        evidence: [],
        deductions: [],
      })),
      summary: "待优化",
    },
    suggestions: [suggestion],
    stories: [],
    processing: {
      extractionMode: "native",
      durationMs: 10,
      capabilityVersions: {
        "resume.score": "resume.score@2.0.0",
        "resume.suggest": "resume.suggest@2.0.0",
      },
      aiAnalysis: {
        status: "fresh",
        analyzedRevision: revision,
        scoreSourceVersion: "resume.score@2.0.0",
        suggestionSourceVersion: "resume.suggest@2.0.0",
      },
    },
  };
}

function aiRevisionResult(revision: number, total = 84) {
  const fixture = analysisFixture(revision);
  return {
    resumeId: fixture.resume.id,
    resumeRevision: revision,
    scorecard: {
      ...fixture.scorecard,
      total,
      summary: `AI 已分析版本 ${revision}`,
      sourceVersion: "resume.score@2.1.0",
    },
    suggestions: [],
    capabilityVersions: {
      "resume.score": "resume.score@2.1.0",
      "resume.suggest": "resume.suggest@2.1.0",
    },
    durationMs: 25,
  };
}

function jobMatchFixture(revision: number): JobMatchBundle {
  const variantAst = structuredClone(ast);
  variantAst.sections[0].entries[0].bullets[0] = "负责核心平台开发";
  return {
    sourceResumeId: "resume-1",
    sourceResumeRevision: revision,
    job: {
      id: "job-1",
      title: "工程师",
      locale: "zh-CN",
      rawText: "工程师岗位描述",
    },
    requirements: [],
    mappings: [],
    coverage: 0,
    summary: "仅表示材料匹配度。",
    riskFlags: [],
    capabilityVersions: {
      "jd.parse": "jd.parse@2.0.0",
      "job.match": "job.match@2.0.0",
    },
    variant: {
      id: "variant-1",
      baseResumeId: "resume-1",
      baseRevision: revision,
      revision: 0,
      jobPostingId: "job-1",
      name: "工程师定制版",
      ast: variantAst,
      appliedSuggestionIds: ["suggestion-1"],
      changes: [],
    },
  };
}

function interviewPlanFixture(revision: number): InterviewPlan {
  return {
    sourceResumeId: "resume-1",
    sourceResumeRevision: revision,
    questions: [
      {
        id: "question-1",
        locale: "zh-CN",
        prompt: "请介绍一个项目。",
        category: "resume",
        difficulty: "intermediate",
        roleFamilies: [],
        skills: [],
        followUps: [],
        scoringAnchors: [],
        source: "test",
        generated: false,
        referenceQuestionIds: [],
      },
    ],
    stories: [],
    durationMinutes: 20,
    maxFollowUps: 2,
    capabilityVersions: {
      "interview.plan": "interview.plan@2.0.0",
    },
  };
}

function evaluationFixture(revision: number): EvaluationResponse {
  return {
    sourceResumeId: "resume-1",
    sourceResumeRevision: revision,
    evaluation: {
      questionId: "question-1",
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
      "answer.coach": "answer.coach@2.0.0",
    },
  };
}

function seedDerived(revision: number) {
  useAppStore.setState({
    jobMatch: jobMatchFixture(revision),
    interviewPlan: interviewPlanFixture(revision),
    evaluations: [evaluationFixture(revision)],
    renders: { professional: { template: "professional" } as RenderResponse },
    previewedRenderHashes: ["previewed"],
    previewMode: "current",
  });
}

beforeEach(() => {
  apiMocks.analyzeResumeRevision.mockReset();
  apiMocks.analyzeResumeRevision.mockImplementation(
    () => new Promise(() => undefined),
  );
});

afterEach(() => {
  useAppStore.getState().goHomeWithoutArchive();
  useAppStore.getState().reset();
});

describe("resume-derived state revisions", () => {
  it("applies a complete manual edit in one local revision and one undo snapshot", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    seedDerived(0);
    const edited = structuredClone(ast);
    edited.contact.headline = "后端开发工程师";
    edited.sections[0].entries[0].bullets = [
      "使用 Redis 缓存热点数据和会话上下文，提高系统响应速度。",
    ];

    const revision = useAppStore
      .getState()
      .applyManualResumeAst(edited, "已直接编辑简历内容。");

    const state = useAppStore.getState();
    expect(revision).toBe(1);
    expect(state.analysis?.resume).toMatchObject({
      revision: 1,
      ast: {
        contact: { headline: "后端开发工程师" },
        sections: [
          {
            entries: [
              {
                bullets: [
                  "使用 Redis 缓存热点数据和会话上下文，提高系统响应速度。",
                ],
              },
            ],
          },
        ],
      },
    });
    expect(state.analysis?.scorecard.resumeRevision).toBe(0);
    expect(state.analysis?.processing.aiAnalysis?.status).not.toBe("fresh");
    expect(state.analysis?.suggestions[0]?.status).toBe("stale");
    expect(state.undoStack).toHaveLength(1);
    expect(state.resumePanel).toBe("templates");
    expect(state.jobMatch).toBeNull();
    expect(state.interviewPlan).toBeNull();
    expect(state.renders).toEqual({});

    useAppStore.getState().undo();
    expect(useAppStore.getState().analysis?.resume.revision).toBe(0);
  });

  it("invalidates every derived result after an AST revision change", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    seedDerived(0);

    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    const state = useAppStore.getState();
    expect(state.analysis?.resume.revision).toBe(1);
    expect(state.jobMatch).toBeNull();
    expect(state.interviewPlan).toBeNull();
    expect(state.evaluations).toEqual([]);
    expect(state.renders).toEqual({});
    expect(state.previewedRenderHashes).toEqual([]);
  });

  it("invalidates derived results when undo restores another revision", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");
    seedDerived(1);

    useAppStore.getState().undo();

    const state = useAppStore.getState();
    expect(state.analysis?.resume.revision).toBe(0);
    expect(state.jobMatch).toBeNull();
    expect(state.interviewPlan).toBeNull();
    expect(state.evaluations).toEqual([]);
    expect(state.renders).toEqual({});
  });

  it("invalidates derived results after a user-confirmed evidence change", () => {
    useAppStore.getState().setAnalysis(analysisFixture(0, true));
    seedDerived(0);

    useAppStore
      .getState()
      .confirmClaim("claim-1", "负责核心平台开发并按期交付");

    const state = useAppStore.getState();
    expect(state.analysis?.claims[0].status).toBe("user_confirmed");
    expect(state.jobMatch).toBeNull();
    expect(state.interviewPlan).toBeNull();
    expect(state.evaluations).toEqual([]);
    expect(state.renders).toEqual({});
  });

  it("rejects stale asynchronous results and accepts current-version results", () => {
    useAppStore.getState().setAnalysis(analysisFixture(2));

    useAppStore.getState().setJobMatch(jobMatchFixture(1));
    useAppStore.getState().setInterviewPlan(interviewPlanFixture(1));
    useAppStore.getState().addEvaluation(evaluationFixture(1));
    expect(useAppStore.getState().jobMatch).toBeNull();
    expect(useAppStore.getState().interviewPlan).toBeNull();
    expect(useAppStore.getState().evaluations).toEqual([]);

    useAppStore.getState().setJobMatch(jobMatchFixture(2));
    useAppStore.getState().setInterviewPlan(interviewPlanFixture(2));
    useAppStore.getState().addEvaluation(evaluationFixture(2));
    expect(useAppStore.getState().jobMatch?.sourceResumeRevision).toBe(2);
    expect(useAppStore.getState().interviewPlan?.sourceResumeRevision).toBe(2);
    expect(useAppStore.getState().evaluations).toHaveLength(1);
  });

  it("rejects a job variant whose base revision contradicts its response metadata", () => {
    useAppStore.getState().setAnalysis(analysisFixture(2));
    const inconsistent = jobMatchFixture(2);
    inconsistent.variant = { ...inconsistent.variant!, baseRevision: 1 };

    useAppStore.getState().setJobMatch(inconsistent);

    expect(useAppStore.getState().jobMatch).toBeNull();
  });

  it("clears interview progress when the analyzed JD changes", () => {
    useAppStore.getState().setAnalysis(analysisFixture(2));
    useAppStore.getState().setInterviewPlan(interviewPlanFixture(2));
    useAppStore.getState().updateInterviewProgress({
      transcript: "与旧 JD 对应的面试回答草稿",
    });

    useAppStore.getState().setJobMatch(jobMatchFixture(2));

    expect(useAppStore.getState()).toMatchObject({
      interviewPlan: null,
      evaluations: [],
      interviewSetupStage: "intro",
      interviewProgress: null,
    });
  });

  it("opens a real job variant in the shared preview/export state and returns to base", () => {
    useAppStore.getState().setAnalysis(analysisFixture(2));
    useAppStore.getState().setJobMatch(jobMatchFixture(2));
    const variant = useAppStore.getState().jobMatch!.variant!;

    useAppStore.getState().setResumeVariant(variant.id);

    expect(useAppStore.getState()).toMatchObject({
      activeResumeVariantId: variant.id,
      resumePanel: "templates",
      previewMode: "current",
      renders: {},
    });
    expect(variant.ast).not.toEqual(
      useAppStore.getState().analysis!.resume.ast,
    );

    const variantRender = {
      template: "professional",
      sha256: "a".repeat(64),
      report: {
        resumeId: variant.id,
        resumeRevision: variant.revision,
        template: "professional",
        artifactSha256: "a".repeat(64),
      },
    } as RenderResponse;
    useAppStore.getState().setRender(variantRender);
    expect(useAppStore.getState().renders.professional).toBe(variantRender);

    useAppStore.getState().setResumePanel("suggestions");
    expect(useAppStore.getState()).toMatchObject({
      activeResumeVariantId: null,
      resumePanel: "suggestions",
      previewMode: "original",
      renders: {},
    });
  });

  it("rejects a render from the wrong resume version", () => {
    useAppStore.getState().setAnalysis(analysisFixture(2));
    useAppStore.getState().setJobMatch(jobMatchFixture(2));
    const variant = useAppStore.getState().jobMatch!.variant!;
    useAppStore.getState().setResumeVariant(variant.id);

    useAppStore.getState().setRender({
      template: "professional",
      sha256: "b".repeat(64),
      report: {
        resumeId: "resume-1",
        resumeRevision: 2,
        template: "professional",
        artifactSha256: "b".repeat(64),
      },
    } as RenderResponse);

    expect(useAppStore.getState().renders).toEqual({});
  });

  it("keeps current derived results when a decision does not change the AST", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    seedDerived(0);

    useAppStore.getState().decideSuggestion("suggestion-1", "rejected");

    const state = useAppStore.getState();
    expect(state.analysis?.resume.revision).toBe(0);
    expect(state.jobMatch?.sourceResumeRevision).toBe(0);
    expect(state.interviewPlan?.sourceResumeRevision).toBe(0);
    expect(state.evaluations).toHaveLength(1);
    expect(state.renders).toHaveProperty("professional");
  });

  it("marks a suggestion stale when its declared resume revision is no longer current", () => {
    const analysis = analysisFixture(2);
    analysis.suggestions[0].resumeRevision = 1;
    useAppStore.getState().setAnalysis(analysis);

    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    expect(useAppStore.getState().analysis).toMatchObject({
      resume: { revision: 2 },
      suggestions: [{ id: "suggestion-1", status: "stale" }],
    });
    expect(useAppStore.getState().undoStack).toEqual([]);
  });

  it("marks a suggestion stale when the target value no longer matches beforeHash", () => {
    const analysis = analysisFixture();
    analysis.resume.ast.sections[0].entries[0].bullets[0] =
      "已被另一项操作改写";
    useAppStore.getState().setAnalysis(analysis);

    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    expect(useAppStore.getState().analysis).toMatchObject({
      resume: {
        revision: 0,
        ast: {
          sections: [{ entries: [{ bullets: ["已被另一项操作改写"] }] }],
        },
      },
      suggestions: [{ id: "suggestion-1", status: "stale" }],
    });
  });

  it("keeps other valid AI suggestions pending after applying one rewrite", () => {
    const analysis = analysisFixture();
    analysis.resume.ast.sections[0].entries.push({
      id: "entry-2",
      title: "工程师",
      current: false,
      bullets: ["主要负责数据平台"],
      keywords: ["数据平台"],
      sourceBlockIds: ["block-2"],
    });
    analysis.suggestions.push(
      SuggestionSchema.parse({
        id: "suggestion-2",
        resumeRevision: 0,
        sourceBlockIds: ["block-2"],
        claimIds: [],
        kind: "rewrite",
        status: "pending",
        originalText: "主要负责数据平台",
        proposedText: "负责数据平台",
        rationale: "删除弱化表达。",
        beforeHash: stableId("hash", "主要负责数据平台"),
        patches: [
          {
            operation: "replace",
            path: "/sections/0/entries/1/bullets/0",
            value: "负责数据平台",
          },
        ],
        affectedDimensions: ["clarity", "language"],
        factRisk: "none",
        interviewRisk: "none",
      }),
    );
    useAppStore.getState().setAnalysis(analysis);

    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    const revised = useAppStore.getState().analysis!;
    expect(revised.resume.revision).toBe(1);
    expect(
      revised.suggestions.find((item) => item.id === "suggestion-1")?.status,
    ).toBe("accepted");
    expect(
      revised.suggestions.find((item) => item.id === "suggestion-2")?.status,
    ).toBe("pending");
    const remaining = revised.suggestions.filter(
      (item) => item.status === "pending",
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      id: "suggestion-2",
      resumeRevision: 1,
      rationale: "删除弱化表达。",
    });

    useAppStore.getState().decideSuggestion("suggestion-2", "accepted");
    expect(
      useAppStore
        .getState()
        .analysis!.suggestions.find((item) => item.id === "suggestion-2")
        ?.status,
    ).toBe("accepted");
    expect(useAppStore.getState().analysis?.resume.revision).toBe(2);
  });

  it("applies every safe AI rewrite in one revision with one undo snapshot", () => {
    const analysis = analysisFixture();
    analysis.processing.capabilityVersions["resume.suggest"] =
      "resume.suggest@2.0.0";
    analysis.resume.ast.sections[0].entries.push({
      id: "entry-2",
      title: "工程师",
      current: false,
      bullets: ["主要负责数据平台"],
      keywords: ["数据平台"],
      sourceBlockIds: ["block-2"],
    });
    analysis.suggestions.push(
      SuggestionSchema.parse({
        id: "suggestion-2",
        resumeRevision: 0,
        sourceBlockIds: ["block-2"],
        claimIds: [],
        kind: "rewrite",
        status: "pending",
        originalText: "主要负责数据平台",
        proposedText: "负责数据平台",
        rationale: "删去“主要”这一弱化词，让职责表达更直接。",
        beforeHash: stableId("hash", "主要负责数据平台"),
        patches: [
          {
            operation: "replace",
            path: "/sections/0/entries/1/bullets/0",
            value: "负责数据平台",
          },
        ],
        affectedDimensions: ["clarity", "language"],
        factRisk: "none",
        interviewRisk: "none",
      }),
    );
    useAppStore.getState().setAnalysis(analysis);

    const count = useAppStore.getState().applyAiSuggestions();

    const revised = useAppStore.getState();
    expect(count).toBe(2);
    expect(revised.analysis?.resume).toMatchObject({
      revision: 1,
      ast: {
        sections: [
          {
            entries: [
              { bullets: ["负责核心平台开发"] },
              { bullets: ["负责数据平台"] },
            ],
          },
        ],
      },
    });
    expect(revised.analysis?.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "suggestion-1", status: "accepted" }),
        expect.objectContaining({ id: "suggestion-2", status: "accepted" }),
      ]),
    );
    expect(revised.analysis?.processing.capabilityVersions["resume.suggest"])
      .toBe("resume.suggest@2.0.0");
    expect(revised.undoStack).toHaveLength(1);
  });

  it("replaces pending rule output with regenerated AI suggestions", () => {
    const analysis = analysisFixture();
    analysis.processing.capabilityVersions["resume.suggest"] =
      "resume.suggest@1.0.0";
    const generated = SuggestionSchema.parse({
      ...analysis.suggestions[0],
      id: "suggestion-ai-1",
      rationale:
        "“负责平台开发”没有说明职责边界；在不增加新事实的前提下，保留原动作并强化核心对象。",
    });
    useAppStore.getState().setAnalysis(analysis);

    useAppStore
      .getState()
      .replaceAiSuggestions([generated], "resume.suggest@2.0.0");

    expect(useAppStore.getState().analysis).toMatchObject({
      suggestions: [
        {
          id: "suggestion-ai-1",
          status: "pending",
        },
      ],
      processing: {
        capabilityVersions: {
          "resume.suggest": "resume.suggest@2.0.0",
        },
      },
    });
    expect(useAppStore.getState().selectedSuggestionId).toBe("suggestion-ai-1");
  });

  it("keeps the old AI score hidden while rebuilding evidence for a manual factual rewrite", () => {
    const analysis = analysisFixture();
    analysis.scorecard.total = 99;
    analysis.scorecard.dimensions.forEach((dimension) => {
      dimension.evidence = ["旧评分证据"];
    });
    useAppStore.getState().setAnalysis(analysis);
    const manualText = "通过自动化发布流程，将交付耗时降低 30%";

    useAppStore
      .getState()
      .decideSuggestion("suggestion-1", "manual", manualText);

    const revised = useAppStore.getState().analysis!;
    expect(revised.scorecard).toMatchObject({ resumeRevision: 0, total: 99 });
    expect(revised.processing.aiAnalysis?.status).not.toBe("fresh");
    const manualEvidence = revised.evidence.find(
      (asset) =>
        asset.kind === "user_statement" && asset.content === manualText,
    );
    expect(manualEvidence).toMatchObject({ verifiedByUser: true });
    const claim = revised.claims.find((item) => item.text === manualText);
    expect(claim).toMatchObject({ status: "user_confirmed" });
    expect(claim?.evidenceAssetIds).toContain(manualEvidence?.id);
    expect(
      revised.stories.find((story) => story.claimIds.includes(claim!.id)),
    ).toMatchObject({
      title: manualText,
      evidenceAssetIds: expect.arrayContaining([manualEvidence!.id]),
    });
  });

  it("moves a manual edit through stale, refreshing, and fresh AI states", async () => {
    apiMocks.analyzeResumeRevision.mockResolvedValueOnce(
      aiRevisionResult(1, 87),
    );
    useAppStore.getState().setAnalysis(analysisFixture());
    const edited = structuredClone(ast);
    edited.contact.headline = "平台开发工程师";

    expect(
      useAppStore.getState().applyManualResumeAst(edited, "修改职业标题"),
    ).toBe(1);
    expect(
      useAppStore.getState().analysis?.processing.aiAnalysis?.status,
    ).toBe("stale");

    await vi.waitFor(() =>
      expect(apiMocks.analyzeResumeRevision).toHaveBeenCalledOnce(),
    );
    await vi.waitFor(() =>
      expect(
        useAppStore.getState().analysis?.processing.aiAnalysis?.status,
      ).toBe("fresh"),
    );

    expect(useAppStore.getState().analysis).toMatchObject({
      resume: { revision: 1 },
      scorecard: { resumeRevision: 1, total: 87 },
      suggestions: [],
      processing: {
        aiAnalysis: {
          status: "fresh",
          analyzedRevision: 1,
          scoreSourceVersion: "resume.score@2.1.0",
          suggestionSourceVersion: "resume.suggest@2.1.0",
        },
      },
    });
  });

  it("keeps the edited AST and undo history when AI refresh fails, then retries", async () => {
    apiMocks.analyzeResumeRevision.mockRejectedValueOnce(
      new Error("AI 分析未完成，未返回本地模板结果，请稍后重试。"),
    );
    useAppStore.getState().setAnalysis(analysisFixture());
    const edited = structuredClone(ast);
    edited.contact.headline = "后端平台工程师";

    useAppStore.getState().applyManualResumeAst(edited, "修改职业标题");
    await vi.waitFor(() =>
      expect(
        useAppStore.getState().analysis?.processing.aiAnalysis?.status,
      ).toBe("failed"),
    );

    expect(useAppStore.getState().analysis?.resume.ast.contact.headline).toBe(
      "后端平台工程师",
    );
    expect(useAppStore.getState().undoStack).toHaveLength(1);
    expect(useAppStore.getState().error).toContain("AI 分析未完成");

    apiMocks.analyzeResumeRevision.mockResolvedValueOnce(
      aiRevisionResult(1, 90),
    );
    useAppStore.getState().retryAiAnalysis();
    await vi.waitFor(() =>
      expect(
        useAppStore.getState().analysis?.processing.aiAnalysis?.status,
      ).toBe("fresh"),
    );
    expect(useAppStore.getState().analysis?.scorecard.total).toBe(90);
    expect(useAppStore.getState().analysis?.resume.ast.contact.headline).toBe(
      "后端平台工程师",
    );
  });

  it("aborts and ignores a late response from an older revision", async () => {
    let resolveFirst: (value: ReturnType<typeof aiRevisionResult>) => void =
      () => undefined;
    let resolveSecond: (value: ReturnType<typeof aiRevisionResult>) => void =
      () => undefined;
    apiMocks.analyzeResumeRevision
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    useAppStore.getState().setAnalysis(analysisFixture());
    const firstEdit = structuredClone(ast);
    firstEdit.contact.headline = "第一版标题";
    useAppStore.getState().applyManualResumeAst(firstEdit, "第一次修改");
    await vi.waitFor(() =>
      expect(apiMocks.analyzeResumeRevision).toHaveBeenCalledTimes(1),
    );
    const firstSignal = apiMocks.analyzeResumeRevision.mock.calls[0][1] as
      | AbortSignal
      | undefined;

    const secondEdit = structuredClone(firstEdit);
    secondEdit.contact.headline = "第二版标题";
    useAppStore.getState().applyManualResumeAst(secondEdit, "第二次修改");
    await vi.waitFor(() =>
      expect(apiMocks.analyzeResumeRevision).toHaveBeenCalledTimes(2),
    );
    expect(firstSignal?.aborted).toBe(true);

    resolveFirst(aiRevisionResult(1, 11));
    await Promise.resolve();
    expect(useAppStore.getState().analysis).toMatchObject({
      resume: { revision: 2 },
      scorecard: { total: 60 },
    });

    resolveSecond(aiRevisionResult(2, 92));
    await vi.waitFor(() =>
      expect(useAppStore.getState().analysis).toMatchObject({
        resume: { revision: 2 },
        scorecard: { resumeRevision: 2, total: 92 },
        processing: { aiAnalysis: { status: "fresh" } },
      }),
    );
  });

  it("restores a complete AI snapshot on undo without requesting it again", async () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    const edited = structuredClone(ast);
    edited.contact.headline = "待撤销标题";
    useAppStore.getState().applyManualResumeAst(edited, "临时修改");
    useAppStore.getState().undo();

    await Promise.resolve();
    await Promise.resolve();

    expect(apiMocks.analyzeResumeRevision).not.toHaveBeenCalled();
    expect(useAppStore.getState().analysis).toMatchObject({
      resume: { revision: 0 },
      processing: { aiAnalysis: { status: "fresh", analyzedRevision: 0 } },
    });
  });

  it("removes claims, evidence links, and stories for deleted resume content", () => {
    const analysis = analysisFixture(0, true);
    analysis.evidence = [
      {
        id: "evidence-1",
        kind: "resume_text",
        label: "原简历文字",
        content: "负责平台开发",
        sourceBlockIds: ["block-1"],
        verifiedByUser: false,
        confidence: 0.7,
      },
    ];
    analysis.claims[0].evidenceAssetIds = ["evidence-1"];
    analysis.stories = [
      {
        id: "story-1",
        title: "负责平台开发",
        situation: "背景",
        task: "任务",
        action: "负责平台开发",
        result: "待补充",
        claimIds: ["claim-1"],
        evidenceAssetIds: ["evidence-1"],
        keywords: ["平台"],
        riskNotes: [],
      },
    ];
    analysis.suggestions[0] = SuggestionSchema.parse({
      ...analysis.suggestions[0],
      kind: "remove",
      proposedText: undefined,
      patches: [
        {
          operation: "remove",
          path: "/sections/0/entries/0/bullets/0",
        },
      ],
    });
    useAppStore.getState().setAnalysis(analysis);

    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    const revised = useAppStore.getState().analysis!;
    expect(revised.resume.ast.sections[0].entries[0].bullets).toEqual([]);
    expect(revised.claims).toEqual([]);
    expect(revised.evidence).toEqual([]);
    expect(revised.stories).toEqual([]);
  });

  it("undo restores the complete pre-revision analysis snapshot", () => {
    const analysis = analysisFixture();
    analysis.originalPdfBase64 = "JVBERi0xLjc=";
    analysis.processing.capabilityVersions = {
      "resume.score": "resume.score@test",
    };
    const original = structuredClone(analysis);
    useAppStore.getState().setAnalysis(analysis);

    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");
    expect(useAppStore.getState().undoStack[0]).toMatchObject({
      originalPdfBase64: "JVBERi0xLjc=",
    });

    const persisted = JSON.parse(
      window.sessionStorage.getItem(SESSION_STORAGE_KEY_V3)!,
    ).state;
    expect(persisted.analysis).not.toHaveProperty("originalPdfBase64");
    expect(persisted.undoStack[0]).not.toHaveProperty("originalPdfBase64");
    expect(JSON.stringify(persisted)).not.toContain("JVBERi0xLjc=");

    useAppStore.getState().undo();

    expect(useAppStore.getState().analysis).toEqual(original);
  });
});
