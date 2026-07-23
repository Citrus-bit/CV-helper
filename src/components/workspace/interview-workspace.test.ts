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
});
