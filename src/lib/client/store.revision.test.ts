// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  ResumeASTSchema,
  SuggestionSchema,
  type ScoreDimensionId,
} from "@/lib/domain";
import type {
  AnalysisBundle,
  EvaluationResponse,
  InterviewPlan,
  JobMatchBundle,
  RenderResponse,
} from "./contracts";
import { useAppStore } from "./store";

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

const dimensionIds: ScoreDimensionId[] = ["impact", "completeness", "clarity", "structure", "ats", "language"];

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
    beforeHash: "before-hash",
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
      dimensions: dimensionIds.map((id) => ({ id, label: id, score: 10, maxScore: 20, evidence: [], deductions: [] })),
      summary: "待优化",
    },
    suggestions: [suggestion],
    stories: [],
    pagePreviews: [],
    processing: { extractionMode: "native", durationMs: 10, capabilityVersions: {} },
  };
}

function jobMatchFixture(revision: number): JobMatchBundle {
  return {
    sourceResumeId: "resume-1",
    sourceResumeRevision: revision,
    job: { id: "job-1", title: "工程师", locale: "zh-CN", rawText: "工程师岗位描述" },
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
      ast,
      appliedSuggestionIds: [],
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
      dimensions: { relevance: 16, structure: 16, evidence: 16, roleCompetency: 16, clarity: 16 },
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

    useAppStore.getState().confirmClaim("claim-1", "负责核心平台开发并按期交付");

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
});
