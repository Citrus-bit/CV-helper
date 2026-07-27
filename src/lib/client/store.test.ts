// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import type {
  AnalysisBundle,
  EvaluationResponse,
  InterviewPlan,
} from "./contracts";
import { SESSION_STORAGE_KEY_V3, useAppStore } from "./store";
import { stableId } from "@/lib/baseline/utils";

function analysisFixture(): AnalysisBundle {
  return {
    resume: {
      id: "resume-1",
      revision: 0,
      originalFileName: "candidate.pdf",
      mimeType: "application/pdf",
      locale: "zh-CN",
      pageCount: 1,
      parseMethod: "native",
      sourceBlocks: [
        {
          id: "block-1",
          pageIndex: 0,
          order: 0,
          text: "建设发布流程并支持团队交付",
          bbox: { x: 0.1, y: 0.2, width: 0.7, height: 0.04 },
          source: "native",
          confidence: 0.99,
          role: "list-item",
        },
        {
          id: "block-2",
          pageIndex: 0,
          order: 1,
          text: "建设发布流程并支持团队交付",
          bbox: { x: 0.1, y: 0.3, width: 0.7, height: 0.04 },
          source: "native",
          confidence: 0.99,
          role: "list-item",
        },
      ],
      ast: {
        schemaVersion: "1.0",
        locale: "zh-CN",
        contact: { name: "测试候选人", links: [] },
        sections: [
          {
            id: "experience",
            type: "experience",
            title: "工作经历",
            sourceBlockIds: ["block-1", "block-2"],
            entries: [
              {
                id: "entry-1",
                title: "工程师",
                current: true,
                bullets: ["建设发布流程并支持团队交付"],
                keywords: [],
                sourceBlockIds: ["block-1"],
              },
              {
                id: "entry-2",
                title: "工程师",
                current: false,
                bullets: ["建设发布流程并支持团队交付"],
                keywords: [],
                sourceBlockIds: ["block-2"],
              },
            ],
          },
        ],
      },
      parsingWarnings: [],
    },
    evidence: [
      {
        id: "resume-evidence-1",
        kind: "resume_text",
        label: "简历原文",
        content: "建设发布流程并支持团队交付",
        sourceBlockIds: ["block-1"],
        verifiedByUser: false,
        confidence: 0.99,
      },
    ],
    claims: [
      {
        id: "claim-1",
        text: "建设发布流程并支持团队交付",
        sourceBlockIds: ["block-1"],
        evidenceAssetIds: ["resume-evidence-1"],
        status: "resume_only",
        confidence: 0.65,
        missingInformation: ["result"],
      },
    ],
    scorecard: {
      resumeId: "resume-1",
      resumeRevision: 0,
      total: 70,
      summary: "测试评分",
      dimensions: [
        {
          id: "impact",
          label: "成果影响",
          score: 10,
          maxScore: 20,
          evidence: [],
          deductions: [],
        },
        {
          id: "completeness",
          label: "完整性",
          score: 12,
          maxScore: 15,
          evidence: [],
          deductions: [],
        },
        {
          id: "clarity",
          label: "清晰度",
          score: 12,
          maxScore: 15,
          evidence: [],
          deductions: [],
        },
        {
          id: "structure",
          label: "结构",
          score: 12,
          maxScore: 15,
          evidence: [],
          deductions: [],
        },
        {
          id: "ats",
          label: "ATS",
          score: 12,
          maxScore: 15,
          evidence: [],
          deductions: [],
        },
        {
          id: "language",
          label: "语言",
          score: 12,
          maxScore: 20,
          evidence: [],
          deductions: [],
        },
      ],
    },
    suggestions: [
      {
        id: "suggestion-1",
        resumeRevision: 0,
        sourceBlockIds: ["block-1"],
        claimIds: ["claim-1"],
        kind: "ask_user",
        status: "pending",
        originalText: "建设发布流程并支持团队交付",
        rationale: "缺少可核实结果。",
        question: "这项工作带来了什么变化？",
        beforeHash: stableId("hash", "建设发布流程并支持团队交付"),
        patches: [
          {
            operation: "replace",
            path: "/sections/0/entries/0/bullets/0",
            value: "建设发布流程并支持团队交付",
          },
        ],
        affectedDimensions: ["impact"],
        factRisk: "medium",
        interviewRisk: "low",
      },
    ],
    stories: [
      {
        id: "story-1",
        title: "建设发布流程并支持团队交付",
        situation: "待补充：当时的背景与约束",
        task: "待补充：你需要达成的具体目标",
        action: "建设发布流程并支持团队交付",
        result: "待补充：可核实的结果或影响",
        claimIds: ["claim-1"],
        evidenceAssetIds: ["resume-evidence-1"],
        keywords: ["发布流程"],
        riskNotes: ["结果尚不完整，回答前应补充真实信息。"],
      },
    ],
    processing: {
      extractionMode: "native",
      durationMs: 10,
      capabilityVersions: {},
    },
  };
}

function evaluation(
  questionId: string,
  overallScore: number,
): EvaluationResponse {
  return {
    sourceResumeId: "resume-1",
    sourceResumeRevision: 0,
    evaluation: {
      questionId,
      overallScore,
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

function interviewPlanFixture(questionId = "question-1"): InterviewPlan {
  return {
    sourceResumeId: "resume-1",
    sourceResumeRevision: 0,
    questions: [
      {
        id: questionId,
        locale: "zh-CN",
        prompt: "请介绍一个项目。",
        category: "resume",
        difficulty: "intermediate",
        roleFamilies: [],
        skills: [],
        followUps: ["请说明个人行动。"],
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

afterEach(() => {
  useAppStore.getState().reset();
});

describe("suggestion source navigation", () => {
  it("opens the original PDF whenever a suggestion is selected", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.getState().setPreviewMode("current");

    useAppStore.getState().selectSuggestion("suggestion-1");

    expect(useAppStore.getState()).toMatchObject({
      selectedSuggestionId: "suggestion-1",
      previewMode: "original",
    });
  });
});

describe("job draft state", () => {
  it("persists metadata and invalidates interview state when the draft changes", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.getState().setInterviewPlan(interviewPlanFixture());

    useAppStore.getState().updateJobDraft({
      jdText: "高级产品经理岗位，负责 AI 产品规划、数据分析与跨团队项目交付。",
      jobTitle: "高级产品经理",
      seniority: "senior",
      location: "上海",
      language: "zh-CN",
    });

    expect(useAppStore.getState()).toMatchObject({
      jobDraft: {
        jobTitle: "高级产品经理",
        seniority: "senior",
        location: "上海",
        language: "zh-CN",
      },
      interviewPlan: null,
      interviewProgress: null,
      evaluations: [],
    });
    const persisted = JSON.parse(
      sessionStorage.getItem(SESSION_STORAGE_KEY_V3) ?? "{}",
    );
    expect(persisted.state.jobDraft).toMatchObject({
      jobTitle: "高级产品经理",
      seniority: "senior",
      location: "上海",
      language: "zh-CN",
    });
  });
});

describe("interview evaluations", () => {
  it("stores validated follow-up progress and resets it when the plan changes", () => {
    const plan = interviewPlanFixture();
    const mainEvaluation = evaluation("question-1", 80);
    mainEvaluation.evaluation.followUpQuestion = "请说明个人行动。";
    const followUpEvaluation = evaluation("question-1::follow-up:1", 82);
    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.getState().setInterviewPlan(plan);
    useAppStore.getState().addEvaluation(mainEvaluation);

    useAppStore.getState().updateInterviewProgress({
      followUpRound: 1,
      askedFollowUps: ["请说明个人行动。"],
      followUpEvaluation,
      transcript: "这是当前仍可恢复的追问回答。",
      transcriptSource: "text",
    });

    expect(useAppStore.getState().interviewProgress).toMatchObject({
      schemaVersion: 1,
      sourceResumeId: "resume-1",
      sourceResumeRevision: 0,
      questionIndex: 0,
      followUpRound: 1,
      askedFollowUps: ["请说明个人行动。"],
      followUpEvaluation,
      transcript: "这是当前仍可恢复的追问回答。",
    });
    const persisted = JSON.parse(
      sessionStorage.getItem(SESSION_STORAGE_KEY_V3) ?? "{}",
    );
    expect(persisted.state.interviewProgress).toMatchObject({
      schemaVersion: 1,
      followUpRound: 1,
      transcript: "这是当前仍可恢复的追问回答。",
    });
    expect(persisted.state).not.toHaveProperty("recording");

    useAppStore
      .getState()
      .setInterviewPlan(interviewPlanFixture("replacement-question"));

    expect(useAppStore.getState()).toMatchObject({
      evaluations: [],
      interviewProgress: {
        questionIndex: 0,
        followUpRound: 0,
        askedFollowUps: [],
        followUpEvaluation: null,
        transcript: "",
      },
    });
  });

  it("keeps at most one evaluation for each question", () => {
    const first = evaluation("question-1", 80);
    const duplicate = evaluation("question-1", 95);
    const second = evaluation("question-2", 88);

    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.getState().setInterviewPlan({
      sourceResumeId: "resume-1",
      sourceResumeRevision: 0,
      questions: ["question-1", "question-2"].map((id) => ({
        id,
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
      })),
      stories: [],
      durationMinutes: 20,
      maxFollowUps: 2,
    });
    useAppStore.getState().addEvaluation(first);
    useAppStore.getState().addEvaluation(duplicate);
    useAppStore.getState().addEvaluation(second);

    expect(useAppStore.getState().evaluations).toEqual([first, second]);
  });

  it("deduplicates identical consistency warnings without dropping distinct conflicts", () => {
    const result = evaluation("question-1", 80);
    result.consistencyWarnings = [
      "回答出现简历中没有的数值（12、58、76），请核对口径。",
      "  回答出现简历中没有的数值（12、58、76），请核对口径。  ",
      "关联简历声明本身仍待核对，请勿在回答中进一步扩大。",
    ];

    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.getState().setInterviewPlan({
      sourceResumeId: "resume-1",
      sourceResumeRevision: 0,
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
    });

    useAppStore.getState().addEvaluation(result);

    expect(useAppStore.getState().evaluations[0].consistencyWarnings).toEqual([
      "回答出现简历中没有的数值（12、58、76），请核对口径。",
      "关联简历声明本身仍待核对，请勿在回答中进一步扩大。",
    ]);
  });
});

describe("evidence confirmation", () => {
  it("keeps the source claim, stages a precise rewrite, and applies it only after acceptance", () => {
    const original = analysisFixture();
    const confirmedText = "建设发布流程，将平均发布时间缩短 30%";
    useAppStore.getState().setAnalysis(original);

    useAppStore.getState().confirmClaim("claim-1", confirmedText);

    const confirmed = useAppStore.getState().analysis!;
    expect(confirmed.resume.revision).toBe(0);
    expect(confirmed.resume.ast.sections[0].entries[0].bullets[0]).toBe(
      "建设发布流程并支持团队交付",
    );
    expect(confirmed.claims[0]).toMatchObject({
      text: "建设发布流程并支持团队交付",
      sourceBlockIds: ["block-1"],
      status: "user_confirmed",
      evidenceAssetIds: ["resume-evidence-1", "user-statement-claim-1"],
    });
    expect(confirmed.stories[0]).toMatchObject({
      title: "建设发布流程并支持团队交付",
      action: "建设发布流程并支持团队交付",
      result: "待补充：可核实的结果或影响",
      evidenceAssetIds: ["resume-evidence-1"],
    });
    expect(confirmed.evidence.at(-1)).toMatchObject({
      id: "user-statement-claim-1",
      kind: "user_statement",
      content: confirmedText,
      verifiedByUser: true,
    });
    expect(confirmed.suggestions[0]).toMatchObject({
      kind: "rewrite",
      status: "pending",
      proposedText: confirmedText,
      patches: [
        {
          operation: "replace",
          path: "/sections/0/entries/0/bullets/0",
          value: confirmedText,
        },
      ],
    });

    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    const accepted = useAppStore.getState().analysis!;
    expect(accepted.resume.revision).toBe(1);
    expect(accepted.scorecard.resumeRevision).toBe(1);
    expect(accepted.resume.ast.sections[0].entries[0].bullets[0]).toBe(
      confirmedText,
    );
    expect(accepted.resume.ast.sections[0].entries[1].bullets[0]).toBe(
      "建设发布流程并支持团队交付",
    );
    const currentResumeEvidence = accepted.evidence.find(
      (asset) =>
        asset.kind === "resume_text" &&
        asset.content === confirmedText &&
        asset.sourceBlockIds.includes("block-1"),
    );
    expect(currentResumeEvidence).toBeDefined();
    expect(accepted.claims[0]).toMatchObject({
      text: confirmedText,
      action: confirmedText,
      result: confirmedText,
      sourceBlockIds: ["block-1"],
      evidenceAssetIds: [currentResumeEvidence!.id, "user-statement-claim-1"],
      status: "user_confirmed",
      missingInformation: ["具体方法或个人动作"],
    });
    expect(accepted.claims[0].method).toBeUndefined();
    expect(accepted.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: currentResumeEvidence!.id,
          content: confirmedText,
          sourceBlockIds: ["block-1"],
        }),
        expect.objectContaining({
          id: "user-statement-claim-1",
          content: confirmedText,
          verifiedByUser: true,
        }),
      ]),
    );
    expect(
      accepted.evidence.find((asset) => asset.id === "resume-evidence-1"),
    ).toBeUndefined();
    expect(accepted.stories[0]).toMatchObject({
      id: stableId("story", "claim-1"),
      title: confirmedText,
      action: confirmedText,
      result: confirmedText,
      claimIds: ["claim-1"],
      evidenceAssetIds: [currentResumeEvidence!.id, "user-statement-claim-1"],
      riskNotes: [],
    });
  });

  it("undoes both acceptance and the user-statement evidence without losing the original source", () => {
    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore
      .getState()
      .confirmClaim("claim-1", "建设发布流程，将平均发布时间缩短 30%");
    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    useAppStore.getState().undo();
    expect(useAppStore.getState().analysis).toMatchObject({
      resume: { revision: 0 },
      claims: [
        { text: "建设发布流程并支持团队交付", status: "user_confirmed" },
      ],
      suggestions: [{ kind: "rewrite", status: "pending" }],
      stories: [
        {
          title: "建设发布流程并支持团队交付",
          result: "待补充：可核实的结果或影响",
        },
      ],
    });

    useAppStore.getState().undo();
    expect(useAppStore.getState().analysis).toMatchObject({
      resume: { revision: 0 },
      evidence: [{ id: "resume-evidence-1" }],
      claims: [{ text: "建设发布流程并支持团队交付", status: "resume_only" }],
      suggestions: [{ kind: "ask_user", status: "pending" }],
      stories: [
        {
          title: "建设发布流程并支持团队交付",
          evidenceAssetIds: ["resume-evidence-1"],
        },
      ],
    });
    expect(useAppStore.getState().analysis!.suggestions[0]).not.toHaveProperty(
      "proposedText",
    );
  });

  it("does not create a revision when the confirmed text is unchanged", () => {
    const originalText = "建设发布流程并支持团队交付";
    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.getState().confirmClaim("claim-1", originalText);
    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    expect(useAppStore.getState().analysis).toMatchObject({
      resume: { revision: 0 },
      suggestions: [{ status: "accepted", proposedText: originalText }],
    });
  });

  it("treats a final manual rewrite as the verified user statement used by the claim and story", () => {
    const confirmedText = "建设发布流程，将平均发布时间缩短 30%";
    const finalText = "通过自动化发布流程，将平均发布时间缩短 30%";
    useAppStore.getState().setAnalysis(analysisFixture());
    useAppStore.getState().confirmClaim("claim-1", confirmedText);

    useAppStore
      .getState()
      .decideSuggestion("suggestion-1", "manual", finalText);

    const analysis = useAppStore.getState().analysis!;
    expect(analysis.resume.ast.sections[0].entries[0].bullets[0]).toBe(
      finalText,
    );
    expect(analysis.claims[0]).toMatchObject({
      text: finalText,
      action: finalText,
      method: "通过自动化发布流程",
      result: finalText,
      status: "user_confirmed",
      missingInformation: [],
    });
    expect(
      analysis.evidence.find((asset) => asset.id === "user-statement-claim-1"),
    ).toMatchObject({
      content: finalText,
      verifiedByUser: true,
    });
    expect(analysis.stories[0]).toMatchObject({
      title: finalText,
      action: finalText,
      result: finalText,
      riskNotes: [],
    });
  });

  it("creates a story card when the confirmed claim did not have one", () => {
    const analysis = analysisFixture();
    analysis.stories = [];
    useAppStore.getState().setAnalysis(analysis);
    useAppStore
      .getState()
      .confirmClaim("claim-1", "建设发布流程，将平均发布时间缩短 30%");

    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    const rebuilt = useAppStore.getState().analysis!;
    const targetStory = rebuilt.stories.find((story) =>
      story.claimIds.includes("claim-1"),
    );
    const targetResumeEvidence = rebuilt.evidence.find(
      (asset) =>
        asset.kind === "resume_text" &&
        asset.content === "建设发布流程，将平均发布时间缩短 30%",
    );
    expect(targetStory).toMatchObject({
      claimIds: ["claim-1"],
      title: "建设发布流程，将平均发布时间缩短 30%",
      result: "建设发布流程，将平均发布时间缩短 30%",
      evidenceAssetIds: [targetResumeEvidence!.id, "user-statement-claim-1"],
    });
  });

  it("marks a failed replacement stale instead of claiming it was applied", () => {
    const analysis = analysisFixture();
    analysis.suggestions[0] = {
      ...analysis.suggestions[0],
      kind: "rewrite",
      proposedText: "建设发布流程，将平均发布时间缩短 30%",
      patches: [
        {
          operation: "replace",
          path: "/sections/99/entries/0/bullets/0",
          value: "建设发布流程，将平均发布时间缩短 30%",
        },
      ],
    };
    useAppStore.getState().setAnalysis(analysis);
    useAppStore.getState().decideSuggestion("suggestion-1", "accepted");

    expect(useAppStore.getState().analysis).toMatchObject({
      resume: { revision: 0 },
      suggestions: [{ status: "stale" }],
    });
  });

  it("does not reuse a declared patch outside the claim's source block", () => {
    const analysis = analysisFixture();
    analysis.suggestions[0].patches = [
      {
        operation: "replace",
        path: "/sections/0/entries/1/bullets/0",
        value: "建设发布流程并支持团队交付",
      },
    ];
    useAppStore.getState().setAnalysis(analysis);
    useAppStore
      .getState()
      .confirmClaim("claim-1", "建设发布流程，将平均发布时间缩短 30%");

    expect(useAppStore.getState().analysis!.suggestions[0].patches).toEqual([
      {
        operation: "replace",
        path: "/sections/0/entries/0/bullets/0",
        value: "建设发布流程，将平均发布时间缩短 30%",
      },
    ]);
  });
});
