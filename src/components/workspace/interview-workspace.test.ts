// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisBundle,
  EvaluationResponse,
  InterviewPlan,
} from "@/lib/client/contracts";
import {
  disposeRegisteredClientRuntimeActivities,
  registeredClientRuntimeDisposerCountForTests,
} from "@/lib/client/runtime-resources";
import { useAppStore } from "@/lib/client/store";

const apiMocks = vi.hoisted(() => ({
  createInterviewPlan: vi.fn(),
  evaluateAnswer: vi.fn(),
  transcribeBrowserSpeech: vi.fn(),
}));

vi.mock("@/lib/client/api", () => apiMocks);

import { InterviewWorkspace } from "./interview-workspace";

const dimensions = [
  "impact",
  "completeness",
  "clarity",
  "structure",
  "ats",
  "language",
] as const;

function analysisFixture(revision = 0): AnalysisBundle {
  return {
    resume: {
      id: "resume-1",
      revision,
      originalFileName: "candidate.pdf",
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
    },
    evidence: [],
    claims: [],
    scorecard: {
      resumeId: "resume-1",
      resumeRevision: revision,
      total: 60,
      summary: "测试评分",
      dimensions: dimensions.map((id) => ({
        id,
        label: id,
        score: 10,
        maxScore: id === "impact" || id === "language" ? 20 : 15,
        evidence: [],
        deductions: [],
      })),
    },
    suggestions: [],
    stories: [],
    pagePreviews: [],
    processing: {
      extractionMode: "native",
      durationMs: 1,
      capabilityVersions: {},
    },
  };
}

function planFixture(prefix: string, revision = 0): InterviewPlan {
  return {
    sourceResumeId: "resume-1",
    sourceResumeRevision: revision,
    questions: [1, 2].map((number) => ({
      id: `${prefix}-question-${number}`,
      locale: "zh-CN" as const,
      prompt: `${prefix} 第 ${number} 题`,
      category: "resume" as const,
      difficulty: "intermediate" as const,
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
  };
}

function evaluation(questionId: string, revision = 0): EvaluationResponse {
  return {
    sourceResumeId: "resume-1",
    sourceResumeRevision: revision,
    evaluation: {
      questionId,
      overallScore: 80,
      dimensions: {
        relevance: 16,
        structure: 16,
        evidence: 16,
        roleCompetency: 16,
        clarity: 16,
      },
      strengths: ["回答具体"],
      improvements: ["补充背景"],
      citedAnswerFragments: [],
    },
    consistencyWarnings: [],
  };
}

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(InterviewWorkspace),
    ),
  );
}

function seedPlan(plan: InterviewPlan, evaluatedQuestionId?: string) {
  useAppStore
    .getState()
    .setAnalysis(analysisFixture(plan.sourceResumeRevision));
  useAppStore.getState().setInterviewPlan(plan);
  if (evaluatedQuestionId) {
    useAppStore
      .getState()
      .addEvaluation(
        evaluation(evaluatedQuestionId, plan.sourceResumeRevision),
      );
    useAppStore.getState().updateInterviewProgress({ questionIndex: 1 });
  }
}

afterEach(() => {
  cleanup();
  disposeRegisteredClientRuntimeActivities();
  useAppStore.getState().reset();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("InterviewWorkspace session identity", () => {
  it("keeps full question metadata, shows complete coaching, and caps follow-ups at two rounds", async () => {
    const interviewPlan = planFixture("闭环");
    interviewPlan.questions[0] = {
      ...interviewPlan.questions[0],
      roleFamilies: ["product", "cross-industry"],
      skills: ["流程改进", "跨职能协作"],
      followUps: ["第一个追问", "第二个追问", "第三个追问"],
      scoringAnchors: ["说明个人行动", "结果可核对"],
      source: "test-question-pack@1.0.0",
      referenceQuestionIds: ["source-question-1"],
    };
    const mainQuestion = interviewPlan.questions[0];
    const mainResponse = evaluation(mainQuestion.id);
    mainResponse.evaluation.followUpQuestion = "第一个追问";
    mainResponse.evaluation.citedAnswerFragments = ["我重新梳理了入职流程"];
    mainResponse.coaching = {
      headline: "先收紧结构，再补充真实证据。",
      actions: ["开头直接回答问题。"],
      improvedOutline: ["背景：说明场景", "行动：说明个人贡献"],
      factSafetyReminder: "只使用可核对的事实。",
    };
    const firstFollowUpResponse = evaluation(`${mainQuestion.id}::follow-up:1`);
    firstFollowUpResponse.evaluation.followUpQuestion = "第二个追问";
    const secondFollowUpResponse = evaluation(
      `${mainQuestion.id}::follow-up:2`,
    );
    secondFollowUpResponse.evaluation.followUpQuestion = "第三个追问";
    apiMocks.evaluateAnswer
      .mockResolvedValueOnce(mainResponse)
      .mockResolvedValueOnce(firstFollowUpResponse)
      .mockResolvedValueOnce(secondFollowUpResponse);

    seedPlan(interviewPlan);
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("回答转写"), {
      target: { value: "我重新梳理了入职流程，并协调产品与研发落地。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交回答" }));

    expect(
      await screen.findByText("先收紧结构，再补充真实证据。"),
    ).toBeInTheDocument();
    expect(apiMocks.evaluateAnswer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        question: expect.objectContaining({
          id: mainQuestion.id,
          locale: "zh-CN",
          category: "resume",
          difficulty: "intermediate",
          roleFamilies: ["product", "cross-industry"],
          skills: ["流程改进", "跨职能协作"],
          followUps: ["第一个追问", "第二个追问", "第三个追问"],
          scoringAnchors: ["说明个人行动", "结果可核对"],
          source: "test-question-pack@1.0.0",
          generated: false,
          referenceQuestionIds: ["source-question-1"],
        }),
      }),
    );
    expect(
      screen.getByRole("progressbar", { name: "问题相关评分" }),
    ).toHaveAttribute("aria-valuenow", "16");
    expect(screen.getByText("我重新梳理了入职流程")).toBeInTheDocument();
    expect(screen.getByText("建议回答结构")).toBeInTheDocument();
    expect(screen.getByText("只使用可核对的事实。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "回答追问 1/2" }));
    expect(screen.getByText("第一个追问")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("回答转写"), {
      target: { value: "我用交付记录和团队复盘来核对结果。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交回答" }));
    expect(
      await screen.findByRole("button", { name: "回答追问 2/2" }),
    ).toBeInTheDocument();
    expect(apiMocks.evaluateAnswer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        question: expect.objectContaining({
          id: `${mainQuestion.id}::follow-up:1`,
          prompt: "第一个追问",
          skills: mainQuestion.skills,
          followUps: ["第二个追问", "第三个追问"],
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "回答追问 2/2" }));
    expect(screen.getByText("第二个追问")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("回答转写"), {
      target: { value: "我会补充第二个可核对的交付物证据。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交回答" }));

    expect(
      await screen.findByRole("button", { name: "下一题" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /回答追问/ }),
    ).not.toBeInTheDocument();
    expect(apiMocks.evaluateAnswer).toHaveBeenCalledTimes(3);
    expect(useAppStore.getState().evaluations).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    expect(screen.getByText("闭环 第 2 题")).toBeInTheDocument();
  });

  it("registers active speech recognition so workspace navigation aborts it immediately", () => {
    const abort = vi.fn();
    class MockSpeechRecognition implements SpeechRecognitionLike {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort = abort;
    }
    vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
    seedPlan(planFixture("语音"));
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    expect(registeredClientRuntimeDisposerCountForTests()).toBe(1);

    act(() => disposeRegisteredClientRuntimeActivities());

    expect(abort).toHaveBeenCalledOnce();
    expect(registeredClientRuntimeDisposerCountForTests()).toBe(0);
    expect(
      screen.getByRole("button", { name: "开始录音" }),
    ).toBeInTheDocument();
  });

  it("resets the question, transcript, and mutation error for a new plan without breaking next-question navigation", async () => {
    const firstPlan = planFixture("旧计划");
    seedPlan(firstPlan, firstPlan.questions[0].id);
    apiMocks.evaluateAnswer.mockRejectedValueOnce(new Error("旧计划评审失败"));
    renderWorkspace();

    expect(screen.getByText("旧计划 第 2 题")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("回答转写"), {
      target: { value: "这是旧计划中尚未完成的回答内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交回答" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "旧计划评审失败",
    );

    const nextPlan = planFixture("新计划");
    act(() => useAppStore.getState().setInterviewPlan(nextPlan));

    await waitFor(() =>
      expect(screen.getByText("新计划 第 1 题")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("回答转写")).toHaveValue("");
    expect(screen.queryByText("旧计划评审失败")).not.toBeInTheDocument();

    act(() =>
      useAppStore
        .getState()
        .addEvaluation(evaluation(nextPlan.questions[0].id)),
    );
    fireEvent.click(await screen.findByRole("button", { name: "下一题" }));
    expect(screen.getByText("新计划 第 2 题")).toBeInTheDocument();
  });

  it("resets transcript and microphone errors when the resume revision changes", async () => {
    const initialPlan = planFixture("版本零");
    seedPlan(initialPlan, initialPlan.questions[0].id);
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("回答转写"), {
      target: { value: "旧版本简历对应的回答内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始录音" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "当前浏览器不支持语音转写",
    );

    const revisedPlan = planFixture("版本一", 1);
    act(() => {
      useAppStore.getState().setAnalysis(analysisFixture(1));
      useAppStore.getState().setInterviewPlan(revisedPlan);
    });

    await waitFor(() =>
      expect(screen.getByText("版本一 第 1 题")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("回答转写")).toHaveValue("");
    expect(
      screen.queryByText("当前浏览器不支持语音转写"),
    ).not.toBeInTheDocument();
  });

  it("ignores an evaluation that resolves after its plan has been replaced", async () => {
    let finishEvaluation: ((value: EvaluationResponse) => void) | undefined;
    const pendingEvaluation = new Promise<EvaluationResponse>((resolve) => {
      finishEvaluation = resolve;
    });
    apiMocks.evaluateAnswer.mockReturnValueOnce(pendingEvaluation);
    const oldPlan = planFixture("等待中");
    seedPlan(oldPlan);
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("回答转写"), {
      target: { value: "这是一段等待异步评审返回的回答" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交回答" }));
    await waitFor(() => expect(apiMocks.evaluateAnswer).toHaveBeenCalledOnce());

    const replacement = planFixture("替换后");
    replacement.questions[0] = {
      ...replacement.questions[0],
      id: oldPlan.questions[0].id,
    };
    act(() => useAppStore.getState().setInterviewPlan(replacement));
    await act(async () => {
      finishEvaluation?.(evaluation(oldPlan.questions[0].id));
      await pendingEvaluation;
    });

    await waitFor(() =>
      expect(screen.getByText("替换后 第 1 题")).toBeInTheDocument(),
    );
    await waitFor(() => expect(useAppStore.getState().evaluations).toEqual([]));
    expect(screen.queryByText("回答具体")).not.toBeInTheDocument();
  });

  it("ignores a generated plan when the analysis identity changes before it resolves", async () => {
    let finishPlan: ((value: InterviewPlan) => void) | undefined;
    const pendingPlan = new Promise<InterviewPlan>((resolve) => {
      finishPlan = resolve;
    });
    apiMocks.createInterviewPlan.mockReturnValueOnce(pendingPlan);
    useAppStore.getState().setAnalysis(analysisFixture());
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "进入设备检查" }));
    expect(apiMocks.createInterviewPlan).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "设备与隐私检查" }),
    ).toBeInTheDocument();
    expect(screen.getByText("文字回答")).toBeInTheDocument();
    expect(screen.getByText("隐私边界")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始面试" }));
    await waitFor(() =>
      expect(apiMocks.createInterviewPlan).toHaveBeenCalledOnce(),
    );
    act(() => useAppStore.getState().setAnalysis(analysisFixture()));
    await act(async () => {
      finishPlan?.(planFixture("过期计划"));
      await pendingPlan;
    });

    expect(useAppStore.getState().interviewPlan).toBeNull();
    expect(screen.queryByText("过期计划 第 1 题")).not.toBeInTheDocument();
  });

  it("restores an in-progress follow-up, its draft, and its evaluation after remount", async () => {
    const interviewPlan = planFixture("可恢复");
    interviewPlan.questions[0] = {
      ...interviewPlan.questions[0],
      followUps: ["请说明你个人完成的关键动作。"],
    };
    const mainResponse = evaluation(interviewPlan.questions[0].id);
    mainResponse.evaluation.followUpQuestion = "请说明你个人完成的关键动作。";
    const followUpResponse = evaluation(
      `${interviewPlan.questions[0].id}::follow-up:1`,
    );
    apiMocks.evaluateAnswer
      .mockResolvedValueOnce(mainResponse)
      .mockResolvedValueOnce(followUpResponse);
    seedPlan(interviewPlan);

    const mounted = renderWorkspace();
    fireEvent.change(screen.getByLabelText("回答转写"), {
      target: { value: "我先说明主问题中的背景、行动和真实结果。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交回答" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "回答追问 1/2" }),
    );
    fireEvent.change(screen.getByLabelText("回答转写"), {
      target: { value: "这是还没有提交的追问草稿，会保存在本机进度中。" },
    });

    mounted.unmount();
    renderWorkspace();

    expect(
      screen.getByText("请说明你个人完成的关键动作。"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("回答转写")).toHaveValue(
      "这是还没有提交的追问草稿，会保存在本机进度中。",
    );
    expect(useAppStore.getState().interviewProgress).toMatchObject({
      questionIndex: 0,
      followUpRound: 1,
      askedFollowUps: ["请说明你个人完成的关键动作。"],
    });

    fireEvent.click(screen.getByRole("button", { name: "提交回答" }));
    await screen.findByRole("button", { name: "下一题" });
    expect(
      useAppStore.getState().interviewProgress?.followUpEvaluation,
    ).toMatchObject({
      evaluation: {
        questionId: `${interviewPlan.questions[0].id}::follow-up:1`,
      },
    });

    cleanup();
    renderWorkspace();
    expect(screen.getByText("追问 1 评分")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一题" })).toBeInTheDocument();
  });

  it("does not skip a pending follow-up when a reviewed main answer is remounted", () => {
    const interviewPlan = planFixture("不跳过");
    interviewPlan.questions[0] = {
      ...interviewPlan.questions[0],
      followUps: ["还有一个未完成的追问"],
    };
    seedPlan(interviewPlan);
    const mainResponse = evaluation(interviewPlan.questions[0].id);
    mainResponse.evaluation.followUpQuestion = "还有一个未完成的追问";
    useAppStore.getState().addEvaluation(mainResponse);

    renderWorkspace();

    expect(screen.getByText("不跳过 第 1 题")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "回答追问 1/2" }),
    ).toBeInTheDocument();
  });
});
