// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

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
    pagePreviews: [],
    processing: {
      extractionMode: "native",
      durationMs: 10,
      capabilityVersions: {},
    },
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
  };
}

function seedDerived(revision: number) {
  useAppStore.setState({
    jobMatch: jobMatchFixture(revision),
    interviewPlan: interviewPlanFixture(revision),
    evaluations: [evaluationFixture(revision)],
    renders: { professional: { template: "professional" } as RenderResponse },
    previewedRenderHashes: ["previewed"],
    previewMode: "compare",
  });
}

afterEach(() => {
  useAppStore.getState().reset();
});

describe("resume-derived state revisions", () => {
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

  it("stales every other pending suggestion and binds regenerated suggestions to the new revision", () => {
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
    ).toBe("stale");
    const regenerated = revised.suggestions.filter(
      (item) => item.status === "pending",
    );
    expect(regenerated.length).toBeGreaterThan(0);
    expect(regenerated.every((item) => item.resumeRevision === 1)).toBe(true);

    useAppStore.getState().decideSuggestion("suggestion-2", "rejected");
    expect(
      useAppStore
        .getState()
        .analysis!.suggestions.find((item) => item.id === "suggestion-2")
        ?.status,
    ).toBe("stale");
  });

  it("recomputes the score and creates verified evidence for a manual factual rewrite", () => {
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
    expect(revised.scorecard).toMatchObject({
      resumeRevision: 1,
      sourceVersion: "resume.score@1.0.0",
    });
    expect(revised.scorecard.total).toBeCloseTo(75.3, 1);
    expect(revised.scorecard.total).not.toBe(99);
    expect(
      revised.scorecard.dimensions.flatMap((dimension) => dimension.evidence),
    ).not.toContain("旧评分证据");
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
    analysis.pagePreviews = ["data:image/png;base64,cHJldmlldw=="];
    analysis.originalPdfBase64 = "JVBERi0xLjc=";
    analysis.processing.capabilityVersions = {
      "resume.score": "resume.score@test",
    };
    const original = structuredClone(analysis);
    useAppStore.getState().setAnalysis(analysis);

    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");
    expect(useAppStore.getState().undoStack[0]).toMatchObject({
      pagePreviews: ["data:image/png;base64,cHJldmlldw=="],
      originalPdfBase64: "JVBERi0xLjc=",
    });

    const persisted = JSON.parse(
      window.sessionStorage.getItem(SESSION_STORAGE_KEY_V3)!,
    ).state;
    expect(persisted.analysis).toMatchObject({ pagePreviews: [] });
    expect(persisted.analysis).not.toHaveProperty("originalPdfBase64");
    expect(persisted.undoStack[0]).not.toHaveProperty("pagePreviews");
    expect(persisted.undoStack[0]).not.toHaveProperty("originalPdfBase64");
    expect(JSON.stringify(persisted)).not.toContain("cHJldmlldw==");
    expect(JSON.stringify(persisted)).not.toContain("JVBERi0xLjc=");

    useAppStore.getState().undo();

    expect(useAppStore.getState().analysis).toEqual(original);
  });
});
