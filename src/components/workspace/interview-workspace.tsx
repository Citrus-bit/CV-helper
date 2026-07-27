"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Keyboard,
  LoaderCircle,
  LockKeyhole,
  Mic,
  MicOff,
  MonitorCheck,
  Quote,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EvaluationResponse } from "@/lib/client/contracts";
import {
  EstimatedProgressText,
  estimatedDurations,
} from "../estimated-progress";
import {
  createInterviewPlan,
  evaluateAnswer,
  transcribeBrowserSpeech,
} from "@/lib/client/api";
import { registerClientRuntimeDisposer } from "@/lib/client/runtime-resources";
import {
  interviewFollowUpQuestionId,
  useAppStore,
} from "@/lib/client/store";
import type { InterviewQuestion } from "@/lib/domain";

type AnswerSubmission = {
  question: InterviewQuestion;
  followUpRound: number;
  transcript: string;
  source: "speech" | "text";
  speechConfidence?: number;
};

const DIMENSION_LABELS = {
  relevance: "问题相关",
  structure: "表达结构",
  evidence: "证据支撑",
  roleCompetency: "岗位能力",
  clarity: "表达清晰",
} as const;

function followUpQuestion(
  question: InterviewQuestion,
  prompt: string,
  round: number,
  askedFollowUps: readonly string[],
): InterviewQuestion {
  return {
    ...question,
    id: interviewFollowUpQuestionId(question.id, round),
    prompt,
    followUps: question.followUps.filter(
      (candidate) => !askedFollowUps.includes(candidate),
    ),
    generated: true,
    referenceQuestionIds: [
      ...new Set([...question.referenceQuestionIds, question.id]),
    ],
  };
}

function nextFollowUpPrompt(
  response: EvaluationResponse,
  question: InterviewQuestion,
  askedFollowUps: readonly string[],
  maxFollowUps: number,
) {
  if (askedFollowUps.length >= maxFollowUps) return undefined;
  const candidates = [
    response.evaluation.followUpQuestion,
    ...question.followUps,
  ];
  return candidates
    .find((candidate): candidate is string => {
      if (!candidate) return false;
      const normalized = candidate.trim();
      return Boolean(normalized) && !askedFollowUps.includes(normalized);
    })
    ?.trim();
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function abortSpeechRecognition(recognition: SpeechRecognitionLike | null) {
  try {
    recognition?.abort();
  } catch {
    // Browser recognition can already be closed when navigation races onend.
  }
}

export function InterviewWorkspace() {
  const resume = useAppStore((state) => state.analysis?.resume);
  const plan = useAppStore((state) => state.interviewPlan);
  const sessionVersion = useAppStore((state) => state.interviewSessionVersion);
  if (!resume) return null;
  const sessionIdentity = `${resume.id}:${resume.revision}:${sessionVersion}:${plan ? "plan" : "empty"}`;
  return (
    <InterviewWorkspaceSession
      key={sessionIdentity}
      sessionIdentity={sessionIdentity}
      sessionVersion={sessionVersion}
    />
  );
}

function InterviewWorkspaceSession({
  sessionIdentity,
  sessionVersion,
}: {
  sessionIdentity: string;
  sessionVersion: number;
}) {
  const analysis = useAppStore((state) => state.analysis)!;
  const jobMatch = useAppStore((state) => state.jobMatch);
  const plan = useAppStore((state) => state.interviewPlan);
  const setPlan = useAppStore((state) => state.setInterviewPlan);
  const evaluations = useAppStore((state) => state.evaluations);
  const addEvaluation = useAppStore((state) => state.addEvaluation);
  const setupStage = useAppStore((state) => state.interviewSetupStage);
  const setSetupStage = useAppStore(
    (state) => state.setInterviewSetupStage,
  );
  const progress = useAppStore((state) => state.interviewProgress);
  const updateProgress = useAppStore(
    (state) => state.updateInterviewProgress,
  );
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const questionIndex = progress?.questionIndex ?? 0;
  const transcript = progress?.transcript ?? "";
  const followUpRound = progress?.followUpRound ?? 0;
  const askedFollowUps = progress?.askedFollowUps ?? [];
  const followUpEvaluation = progress?.followUpEvaluation ?? null;
  const transcriptSource = progress?.transcriptSource ?? "text";
  const speechConfidenceRef = useRef<number | undefined>(undefined);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const unregisterRecognitionDisposerRef = useRef<(() => void) | null>(null);
  const submittingQuestionIdRef = useRef<string | null>(null);
  const sessionActiveRef = useRef(true);
  const sessionResumeId = analysis.resume.id;
  const sessionResumeRevision = analysis.resume.revision;
  const sessionPlan = plan;

  const isCurrentSession = () => {
    if (!sessionActiveRef.current) return false;
    const current = useAppStore.getState();
    return Boolean(
      current.analysis?.resume.id === sessionResumeId &&
      current.analysis.resume.revision === sessionResumeRevision &&
      current.interviewSessionVersion === sessionVersion &&
      current.interviewPlan === sessionPlan,
    );
  };

  const planMutation = useMutation({
    mutationFn: () =>
      createInterviewPlan({
        resumeId: analysis.resume.id,
        revision: analysis.resume.revision,
        ast: analysis.resume.ast,
        claims: analysis.claims,
        stories: analysis.stories,
        jdText: jobMatch?.job.rawText,
      }),
    onSuccess: (nextPlan) => {
      if (isCurrentSession()) setPlan(nextPlan);
    },
  });

  const evaluationMutation = useMutation({
    mutationFn: async (submission: AnswerSubmission) => {
      const answer =
        submission.source === "speech"
          ? (
              await transcribeBrowserSpeech({
                browserTranscript: submission.transcript,
                locale: analysis.resume.locale,
                browserConfidence: submission.speechConfidence,
              })
            ).transcript
          : submission.transcript;
      if (isCurrentSession()) updateProgress({ transcript: answer });
      const result = await evaluateAnswer({
        resumeId: analysis.resume.id,
        revision: analysis.resume.revision,
        question: submission.question,
        answer,
        claims: analysis.claims,
      });
      if (result.evaluation.questionId !== submission.question.id) {
        throw new Error("评审结果与当前问题不一致，请重试。");
      }
      return result;
    },
    onSuccess: (result, submission) => {
      if (!isCurrentSession()) return;
      if (submission.followUpRound === 0) addEvaluation(result);
      else updateProgress({ followUpEvaluation: result });
    },
    onSettled: (_data, _error, submission) => {
      if (
        isCurrentSession() &&
        submittingQuestionIdRef.current === submission.question.id
      ) {
        submittingQuestionIdRef.current = null;
      }
    },
  });

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value >= 179) {
          recognitionRef.current?.stop();
          setRecording(false);
          return 180;
        }
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  async function startRecording() {
    setPermissionError(null);
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setPermissionError("当前浏览器不支持语音转写，请直接输入文字回答。");
      return;
    }
    try {
      const previousRecognition = recognitionRef.current;
      recognitionRef.current = null;
      unregisterRecognitionDisposerRef.current?.();
      unregisterRecognitionDisposerRef.current = null;
      abortSpeechRecognition(previousRecognition);
      const recognition = new Recognition();
      recognition.lang = analysis.resume.locale === "en-US" ? "en-US" : "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = () => {
        setSeconds(0);
        setRecording(true);
      };
      recognition.onresult = (event) => {
        const results = Array.from(event.results);
        const text = results
          .map((result) => result[0]?.transcript ?? "")
          .join("");
        const confidences = results
          .map((result) => result[0]?.confidence)
          .filter(
            (value): value is number =>
              typeof value === "number" && Number.isFinite(value),
          );
        speechConfidenceRef.current = confidences.length
          ? confidences.reduce((sum, value) => sum + value, 0) /
            confidences.length
          : undefined;
        if (text.trim()) {
          updateProgress({
            transcript: text.trim(),
            transcriptSource: "speech",
          });
        }
      };
      recognition.onerror = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        unregisterRecognitionDisposerRef.current?.();
        unregisterRecognitionDisposerRef.current = null;
        setRecording(false);
        abortSpeechRecognition(recognition);
        setPermissionError(
          "实时转写已停止，请检查浏览器权限，或直接输入文字回答。",
        );
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        unregisterRecognitionDisposerRef.current?.();
        unregisterRecognitionDisposerRef.current = null;
        setRecording(false);
      };
      recognitionRef.current = recognition;
      unregisterRecognitionDisposerRef.current = registerClientRuntimeDisposer(
        () => {
          if (recognitionRef.current !== recognition) return;
          recognitionRef.current = null;
          unregisterRecognitionDisposerRef.current = null;
          setRecording(false);
          abortSpeechRecognition(recognition);
        },
      );
      recognition.start();
    } catch {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      unregisterRecognitionDisposerRef.current?.();
      unregisterRecognitionDisposerRef.current = null;
      setRecording(false);
      abortSpeechRecognition(recognition);
      setPermissionError(
        "无法使用麦克风。请检查浏览器权限，或直接输入文字回答。",
      );
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  useEffect(() => {
    sessionActiveRef.current = true;
    return () => {
      sessionActiveRef.current = false;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      unregisterRecognitionDisposerRef.current?.();
      unregisterRecognitionDisposerRef.current = null;
      abortSpeechRecognition(recognition);
    };
  }, [sessionIdentity]);

  if (!plan) {
    const speechRecognitionAvailable = Boolean(
      typeof window !== "undefined" &&
        (window.SpeechRecognition ?? window.webkitSpeechRecognition),
    );
    if (setupStage === "device_check") {
      return (
        <div className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-5xl place-items-center px-6 py-10">
          <section
            aria-labelledby="device-check-heading"
            className="w-full max-w-3xl border-y border-line py-10"
          >
            <button
              type="button"
              onClick={() => {
                planMutation.reset();
                setSetupStage("intro");
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-sm font-medium text-muted transition-colors hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ArrowLeft aria-hidden="true" size={17} />
              返回面试说明
            </button>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_300px] items-start gap-10">
              <div>
                <span className="grid size-12 place-items-center rounded-[8px] bg-ink text-white">
                  <MonitorCheck aria-hidden="true" size={23} />
                </span>
                <h1
                  id="device-check-heading"
                  data-module-heading
                  tabIndex={-1}
                  className="mt-6 text-2xl font-semibold outline-none"
                >
                  设备与隐私检查
                </h1>
                <p className="mt-3 text-sm leading-7 text-muted">
                  现在不会请求麦克风权限。开始面试后，仍可随时选择语音或直接输入文字。
                </p>
                <button
                  type="button"
                  disabled={planMutation.isPending}
                  onClick={() => planMutation.mutate()}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-[#075bbf] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-50"
                >
                  {planMutation.isPending ? (
                    <LoaderCircle
                      aria-hidden="true"
                      size={18}
                      className="animate-spin"
                    />
                  ) : (
                    <ChevronRight aria-hidden="true" size={18} />
                  )}
                  {planMutation.isPending ? (
                    <>
                      <span>正在准备题目</span>
                      <EstimatedProgressText
                        expectedDurationMs={estimatedDurations.interviewPlan}
                        label="面试题生成预估进度"
                        className="text-white/85"
                      />
                    </>
                  ) : (
                    "开始面试"
                  )}
                </button>
                {planMutation.isError ? (
                  <p role="alert" className="mt-3 text-sm text-danger">
                    无法生成面试计划，请重试。
                  </p>
                ) : null}
              </div>
              <dl className="divide-y divide-line rounded-[8px] border border-line bg-white px-4 shadow-sm">
                <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-4">
                  {speechRecognitionAvailable ? (
                    <Check
                      aria-hidden="true"
                      size={19}
                      className="mt-0.5 text-success"
                    />
                  ) : (
                    <MicOff
                      aria-hidden="true"
                      size={19}
                      className="mt-0.5 text-warning"
                    />
                  )}
                  <div>
                    <dt className="text-sm font-semibold">浏览器语音识别</dt>
                    <dd className="mt-1 text-xs leading-5 text-muted">
                      {speechRecognitionAvailable
                        ? "当前浏览器可用；录音时再请求权限。"
                        : "当前浏览器不可用，不影响文字回答。"}
                    </dd>
                  </div>
                </div>
                <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-4">
                  <Keyboard
                    aria-hidden="true"
                    size={19}
                    className="mt-0.5 text-brand"
                  />
                  <div>
                    <dt className="text-sm font-semibold">文字回答</dt>
                    <dd className="mt-1 text-xs leading-5 text-muted">
                      始终可用，可直接输入或修正转写内容。
                    </dd>
                  </div>
                </div>
                <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-4">
                  <LockKeyhole
                    aria-hidden="true"
                    size={19}
                    className="mt-0.5 text-brand"
                  />
                  <div>
                    <dt className="text-sm font-semibold">隐私边界</dt>
                    <dd className="mt-1 text-xs leading-5 text-muted">
                      本应用只接收转写文字，不保存音频；浏览器供应商可能处理语音。
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </section>
        </div>
      );
    }
    return (
      <div className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-5xl place-items-center px-6 py-10">
        <section className="grid w-full max-w-3xl grid-cols-[1fr_280px] items-center gap-10 border-y border-line py-10">
          <div>
            <span className="grid size-12 place-items-center rounded-[8px] bg-ink text-white">
              <Mic aria-hidden="true" size={23} />
            </span>
            <h1
              data-module-heading
              tabIndex={-1}
              className="mt-6 text-2xl font-semibold outline-none"
            >
              开始证据驱动的模拟面试
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted">
              题目会结合最终简历{jobMatch ? "、目标 JD" : ""}
              和证据薄弱点生成。默认 20 分钟，共 6 道主问题。
            </p>
            <button
              type="button"
              onClick={() => setSetupStage("device_check")}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-[#075bbf] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronRight aria-hidden="true" size={18} />
              进入设备检查
            </button>
          </div>
          <dl className="divide-y divide-line rounded-[8px] border border-line bg-white px-4">
            <div className="flex items-center justify-between py-4">
              <dt className="text-sm text-muted">主问题</dt>
              <dd className="font-semibold">6 道</dd>
            </div>
            <div className="flex items-center justify-between py-4">
              <dt className="text-sm text-muted">追问上限</dt>
              <dd className="font-semibold">每题 2 次</dd>
            </div>
            <div className="flex items-center justify-between py-4">
              <dt className="text-sm text-muted">反馈模式</dt>
              <dd className="font-semibold">逐题教练</dd>
            </div>
          </dl>
        </section>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-4xl place-items-center px-6 py-10">
        <section className="w-full max-w-xl rounded-[8px] border border-line bg-white p-6 shadow-sm">
          <h1
            data-module-heading
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            面试进度需要重新初始化
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            当前题目仍然保留，重新开始本轮即可建立可恢复的本机进度。
          </p>
          <button
            type="button"
            onClick={() => setPlan(plan)}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf]"
          >
            <RotateCcw aria-hidden="true" size={17} />
            重新开始本轮
          </button>
        </section>
      </div>
    );
  }

  const question = plan.questions[questionIndex];
  const mainEvaluation = question
    ? evaluations.find((item) => item.evaluation.questionId === question.id)
    : undefined;
  const completedEvaluations = plan.questions
    .map((item) =>
      evaluations.find(
        (evaluationItem) => evaluationItem.evaluation.questionId === item.id,
      ),
    )
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const complete = !question;

  if (complete) {
    const average = completedEvaluations.length
      ? Math.round(
          completedEvaluations.reduce(
            (sum, item) => sum + item.evaluation.overallScore,
            0,
          ) / completedEvaluations.length,
        )
      : 0;
    return (
      <div className="mx-auto min-h-[calc(100dvh-64px)] max-w-4xl px-6 py-10">
        <span className="grid size-12 place-items-center rounded-full bg-[#eef8f2] text-success">
          <Check aria-hidden="true" size={24} />
        </span>
        <h1
          data-module-heading
          tabIndex={-1}
          className="mt-5 text-2xl font-semibold outline-none"
        >
          本轮面试已完成
        </h1>
        <p className="mt-2 text-sm text-muted">
          共完成 {completedEvaluations.length} 题，平均 {average} 分。
        </p>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {completedEvaluations.map((item) => {
            const itemQuestion = plan.questions.find(
              (candidate) => candidate.id === item.evaluation.questionId,
            );
            return (
              <article
                key={item.evaluation.questionId}
                className="grid grid-cols-[60px_1fr] gap-3 py-5"
              >
                <strong className="text-2xl tabular-nums">
                  {Math.round(item.evaluation.overallScore)}
                </strong>
                <div>
                  <p className="text-sm font-semibold">
                    {itemQuestion?.prompt}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {item.evaluation.improvements[0] ??
                      "回答结构清晰，继续保持具体证据。"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            updateProgress({
              questionIndex: 0,
              transcript: "",
              transcriptSource: "text",
              followUpRound: 0,
              askedFollowUps: [],
              followUpEvaluation: null,
            });
            speechConfidenceRef.current = undefined;
            setSeconds(0);
            setPermissionError(null);
            evaluationMutation.reset();
          }}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line px-4 text-sm font-medium hover:bg-white"
        >
          <RotateCcw aria-hidden="true" size={17} />
          重新查看本轮
        </button>
      </div>
    );
  }

  const maxFollowUps = Math.min(plan.maxFollowUps, 2);
  const activeFollowUpPrompt =
    followUpRound > 0 ? askedFollowUps[followUpRound - 1] : undefined;
  const activeQuestion = activeFollowUpPrompt
    ? followUpQuestion(
        question,
        activeFollowUpPrompt,
        followUpRound,
        askedFollowUps,
      )
    : question;
  const evaluation =
    followUpRound === 0 ? mainEvaluation : (followUpEvaluation ?? undefined);
  const nextFollowUp = evaluation
    ? nextFollowUpPrompt(evaluation, question, askedFollowUps, maxFollowUps)
    : undefined;

  return (
    <div className="mx-auto min-h-[calc(100dvh-64px)] max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            问题 {questionIndex + 1} / {plan.questions.length}
            {followUpRound > 0
              ? ` · 追问 ${followUpRound} / ${maxFollowUps}`
              : ""}
          </p>
          <h1
            data-module-heading
            tabIndex={-1}
            className="mt-1 text-xl font-semibold outline-none"
          >
            {question.category === "technical" ? "岗位能力" : "经历与动机"}
          </h1>
        </div>
        <div
          role="progressbar"
          aria-label="面试进度"
          aria-valuenow={questionIndex + 1}
          aria-valuemin={0}
          aria-valuemax={plan.questions.length}
          aria-valuetext={`第 ${questionIndex + 1} 题，共 ${plan.questions.length} 题`}
          className="h-1.5 w-52 overflow-hidden rounded-full bg-[#e4e5e8]"
        >
          <div
            className="h-full rounded-full bg-brand"
            style={{
              width: `${((questionIndex + 1) / plan.questions.length) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_390px] gap-6">
        <section className="min-w-0 rounded-[8px] border border-line bg-white shadow-sm">
          <div className="border-b border-line p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-[#edf5ff] text-brand">
                <Sparkles aria-hidden="true" size={18} />
              </span>
              <p className="text-lg font-semibold leading-8">
                {activeQuestion.prompt}
              </p>
            </div>
          </div>

          <div className="p-6">
            <div
              className={`flex min-h-24 items-center justify-center gap-1.5 rounded-[8px] border ${recording ? "border-brand bg-[#f3f8ff]" : "border-line bg-[#f7f7f8]"}`}
            >
              <span aria-hidden="true" className="contents">
                {Array.from({ length: 18 }).map((_, index) => (
                  <span
                    key={index}
                    className={`w-1 rounded-full bg-brand ${recording ? "animate-pulse" : "opacity-25"}`}
                    style={{
                      height: recording
                        ? `${18 + ((index * 13) % 42)}px`
                        : "12px",
                      animationDelay: `${index * 45}ms`,
                    }}
                  />
                ))}
              </span>
              <span
                role="timer"
                aria-live="off"
                aria-label={`录音时长 ${formatTime(seconds)}`}
                className="ml-4 text-sm font-medium tabular-nums text-muted"
              >
                <span aria-hidden="true">{formatTime(seconds)}</span>
              </span>
            </div>
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={
                  recording ? stopRecording : () => void startRecording()
                }
                aria-label={recording ? "停止录音" : "开始录音"}
                disabled={Boolean(evaluation) || evaluationMutation.isPending}
                className={`grid size-14 place-items-center rounded-full text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${recording ? "bg-danger hover:bg-[#a82b26]" : "bg-brand hover:bg-[#075bbf]"}`}
              >
                {recording ? (
                  <Square aria-hidden="true" size={20} fill="currentColor" />
                ) : (
                  <Mic aria-hidden="true" size={23} />
                )}
              </button>
            </div>
            <p className="mx-auto mt-3 max-w-xl text-center text-xs leading-5 text-muted">
              语音识别由浏览器提供，可能由浏览器供应商处理；本应用只接收转写文字，不保存音频。
            </p>
            {permissionError ? (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-[8px] bg-[#fff7df] p-3 text-sm leading-6 text-warning"
              >
                <MicOff
                  aria-hidden="true"
                  size={17}
                  className="mt-1 shrink-0"
                />
                {permissionError}
              </p>
            ) : null}

            <label
              htmlFor="transcript"
              className="mt-6 block text-sm font-medium"
            >
              回答转写
            </label>
            <textarea
              id="transcript"
              value={transcript}
              readOnly={Boolean(evaluation) || evaluationMutation.isPending}
              onChange={(event) => {
                updateProgress({
                  transcript: event.target.value,
                  transcriptSource: "text",
                });
                if (evaluationMutation.isError) evaluationMutation.reset();
              }}
              rows={8}
              placeholder="录音转写会显示在这里，也可以直接输入或修正文字"
              className="mt-2 w-full resize-y rounded-[8px] border border-line p-3 text-sm leading-6 outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={
                Boolean(evaluation) ||
                transcript.trim().length < 10 ||
                evaluationMutation.isPending ||
                recording
              }
              onClick={() => {
                if (evaluation || submittingQuestionIdRef.current) return;
                submittingQuestionIdRef.current = activeQuestion.id;
                evaluationMutation.mutate({
                  question: activeQuestion,
                  followUpRound,
                  transcript: transcript.trim(),
                  source: transcriptSource,
                  speechConfidence: speechConfidenceRef.current,
                });
              }}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-sm font-medium text-white hover:bg-[#075bbf] disabled:opacity-45"
            >
              {evaluationMutation.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  size={18}
                  className="animate-spin"
                />
              ) : (
                <Send aria-hidden="true" size={18} />
              )}
              {evaluationMutation.isPending ? (
                <>
                  <span>正在评审</span>
                  <EstimatedProgressText
                    expectedDurationMs={estimatedDurations.answerEvaluation}
                    label="回答评审预估进度"
                    className="text-white/85"
                  />
                </>
              ) : evaluation ? (
                "本题已完成"
              ) : (
                "提交回答"
              )}
            </button>
            {evaluationMutation.isError ? (
              <p
                role="alert"
                className="mt-3 rounded-[8px] bg-[#fff0ef] p-3 text-sm leading-6 text-danger"
              >
                {evaluationMutation.error instanceof Error
                  ? evaluationMutation.error.message
                  : "回答评审失败，请重试。"}
              </p>
            ) : null}
          </div>
        </section>

        <aside
          className="rounded-[8px] border border-line bg-white shadow-sm"
          aria-label="回答反馈"
        >
          {evaluation ? (
            <>
              <div className="border-b border-line p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted">
                      {followUpRound > 0
                        ? `追问 ${followUpRound} 评分`
                        : "本题评分"}
                    </p>
                    <p className="mt-1 text-[34px] font-semibold tabular-nums">
                      {Math.round(evaluation.evaluation.overallScore)}
                      <span className="text-sm font-normal text-muted">
                        {" "}
                        / 100
                      </span>
                    </p>
                  </div>
                  <p className="pb-1 text-xs text-muted">五维合计</p>
                </div>
              </div>
              <div className="border-b border-line p-5">
                <p className="text-sm font-semibold">评分明细</p>
                <dl className="mt-3 space-y-2.5">
                  {(
                    Object.entries(evaluation.evaluation.dimensions) as Array<
                      [keyof typeof DIMENSION_LABELS, number]
                    >
                  ).map(([id, score]) => (
                    <div
                      key={id}
                      className="grid grid-cols-[64px_minmax(0,1fr)_38px] items-center gap-2"
                    >
                      <dt className="text-xs text-muted">
                        {DIMENSION_LABELS[id]}
                      </dt>
                      <dd
                        role="progressbar"
                        aria-label={`${DIMENSION_LABELS[id]}评分`}
                        aria-valuemin={0}
                        aria-valuemax={20}
                        aria-valuenow={score}
                        className="h-1.5 overflow-hidden rounded-full bg-line"
                      >
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${(score / 20) * 100}%` }}
                        />
                      </dd>
                      <dd className="text-right text-xs font-semibold tabular-nums">
                        {Math.round(score)} / 20
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="space-y-5 border-b border-line p-5">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Check
                      aria-hidden="true"
                      size={17}
                      className="text-success"
                    />
                    有效部分
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-muted">
                    {evaluation.evaluation.strengths.length > 0 ? (
                      evaluation.evaluation.strengths.map((item) => (
                        <li key={item}>• {item}</li>
                      ))
                    ) : (
                      <li>本轮暂未识别出稳定优势。</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles
                      aria-hidden="true"
                      size={17}
                      className="text-brand"
                    />
                    改进重点
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-muted">
                    {evaluation.evaluation.improvements.length > 0 ? (
                      evaluation.evaluation.improvements.map((item) => (
                        <li key={item}>• {item}</li>
                      ))
                    ) : (
                      <li>当前回答未发现明显问题。</li>
                    )}
                  </ul>
                </div>
                {evaluation.evaluation.citedAnswerFragments.length > 0 ? (
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Quote
                        aria-hidden="true"
                        size={16}
                        className="text-brand"
                      />
                      回答引用
                    </p>
                    <div className="mt-2 space-y-2">
                      {evaluation.evaluation.citedAnswerFragments.map(
                        (fragment) => (
                          <blockquote
                            key={fragment}
                            className="border-l-2 border-brand pl-3 text-xs leading-5 text-muted"
                          >
                            {fragment}
                          </blockquote>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              {evaluation.coaching ? (
                <div className="space-y-4 border-b border-line p-5">
                  <div>
                    <p className="text-xs font-medium text-brand">面试教练</p>
                    <p className="mt-1 text-sm font-semibold leading-6">
                      {evaluation.coaching.headline}
                    </p>
                  </div>
                  <ul className="space-y-2 text-sm leading-6 text-muted">
                    {evaluation.coaching.actions.map((action) => (
                      <li key={action}>• {action}</li>
                    ))}
                  </ul>
                  <div>
                    <p className="text-xs font-semibold">建议回答结构</p>
                    <ol className="mt-2 space-y-1.5 text-xs leading-5 text-muted">
                      {evaluation.coaching.improvedOutline.map(
                        (item, index) => (
                          <li key={item}>
                            <span className="mr-1.5 font-semibold text-ink">
                              {index + 1}.
                            </span>
                            {item}
                          </li>
                        ),
                      )}
                    </ol>
                  </div>
                  <div className="rounded-[8px] bg-surface p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold">
                      <ShieldCheck aria-hidden="true" size={15} />
                      事实边界
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {evaluation.coaching.factSafetyReminder}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="space-y-4 p-5">
                {evaluation.consistencyWarnings.length > 0 ? (
                  <div className="rounded-[8px] bg-[#fff7df] p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                      <AlertTriangle aria-hidden="true" size={16} />
                      口径核对
                    </p>
                    <ul className="mt-1 space-y-1 text-xs leading-5 text-warning">
                      {evaluation.consistencyWarnings.map((warning) => (
                        <li key={warning}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-success">
                    <ShieldCheck aria-hidden="true" size={16} />
                    未发现与简历明显冲突
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (nextFollowUp) {
                      updateProgress({
                        askedFollowUps: [...askedFollowUps, nextFollowUp],
                        followUpRound: followUpRound + 1,
                        followUpEvaluation: null,
                        transcript: "",
                        transcriptSource: "text",
                      });
                    } else {
                      updateProgress({
                        questionIndex: questionIndex + 1,
                        followUpRound: 0,
                        askedFollowUps: [],
                        followUpEvaluation: null,
                        transcript: "",
                        transcriptSource: "text",
                      });
                    }
                    speechConfidenceRef.current = undefined;
                    setSeconds(0);
                    setPermissionError(null);
                    evaluationMutation.reset();
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-ink px-4 text-sm font-medium text-white hover:bg-black"
                >
                  {nextFollowUp
                    ? `回答追问 ${followUpRound + 1}/${maxFollowUps}`
                    : "下一题"}
                  <ChevronRight aria-hidden="true" size={17} />
                </button>
              </div>
            </>
          ) : (
            <div className="grid min-h-[420px] place-items-center p-6 text-center">
              <div>
                <Sparkles
                  aria-hidden="true"
                  size={28}
                  className="mx-auto text-muted"
                />
                <p className="mt-3 text-sm font-medium">提交后查看逐题反馈</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  评分只评价回答内容，不评价口音、音色或情绪。
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
