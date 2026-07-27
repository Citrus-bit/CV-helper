// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisBundle,
  EvaluationResponse,
  InterviewPlan,
} from "./contracts";
import {
  beginAnalysisRequest,
  hasActiveAnalysisRequest,
} from "./analysis-request";
import { clearRecentAnalyses, getRecentAnalysis } from "./recent-analysis";
import { API_RATE_LIMIT_SESSION_KEY } from "./privacy";
import {
  disposeRegisteredClientRuntimeActivities,
  registerClientCacheCleaner,
  registerClientRuntimeDisposer,
  trackObjectUrl,
  trackedFetch,
  trackedObjectUrlCountForTests,
} from "./runtime-resources";
import {
  SESSION_STORAGE_KEY_V2,
  SESSION_STORAGE_KEY_V3,
  mergePersistedSessionState,
  migratePersistedSessionState,
  readMigratedSessionValue,
  useAppStore,
} from "./store";

function analysisFixture(): AnalysisBundle {
  return {
    resume: {
      id: "resume-history",
      revision: 2,
      originalFileName: "candidate-history.pdf",
      mimeType: "application/pdf",
      locale: "zh-CN",
      pageCount: 2,
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
      resumeId: "resume-history",
      resumeRevision: 2,
      total: 78,
      summary: "重点经历清楚，可继续补强结果证据。",
      sourceVersion: "resume.score@2.0.0",
      dimensions: [
        ["impact", 18, 25],
        ["completeness", 12, 15],
        ["clarity", 12, 15],
        ["structure", 12, 15],
        ["ats", 12, 15],
        ["language", 12, 15],
      ].map(([dimensionId, score, maxScore]) => ({
        id: dimensionId as
          | "impact"
          | "completeness"
          | "clarity"
          | "structure"
          | "ats"
          | "language",
        label: String(dimensionId),
        score: Number(score),
        maxScore: Number(maxScore),
        evidence: [],
        deductions: [],
      })),
    },
    suggestions: [],
    stories: [],
    processing: {
      extractionMode: "native",
      durationMs: 12,
      capabilityVersions: {
        "resume.score": "resume.score@2.0.0",
        "resume.suggest": "resume.suggest@2.0.0",
      },
      aiAnalysis: {
        status: "fresh",
        analyzedRevision: 2,
        scoreSourceVersion: "resume.score@2.0.0",
        suggestionSourceVersion: "resume.suggest@2.0.0",
      },
    },
  };
}

function interviewPlanFixture(): InterviewPlan {
  return {
    sourceResumeId: "resume-history",
    sourceResumeRevision: 2,
    questions: [
      {
        id: "history-question-1",
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

function mainEvaluationFixture(): EvaluationResponse {
  return {
    sourceResumeId: "resume-history",
    sourceResumeRevision: 2,
    evaluation: {
      questionId: "history-question-1",
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
      followUpQuestion: "请说明个人行动。",
    },
    consistencyWarnings: [],
  };
}

function followUpEvaluationFixture(): EvaluationResponse {
  return {
    ...mainEvaluationFixture(),
    evaluation: {
      ...mainEvaluationFixture().evaluation,
      questionId: "history-question-1::follow-up:1",
      overallScore: 84,
      followUpQuestion: undefined,
    },
  };
}

function installLocalStorageMock() {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    } satisfies Storage,
  });
}

function storedPdf(contents: string) {
  return new NodeBlob([contents], {
    type: "application/pdf",
  }) as unknown as Blob;
}

beforeEach(async () => {
  installLocalStorageMock();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
  await clearRecentAnalyses();
  useAppStore.setState({ recentAnalyses: [], error: null });
});

afterEach(async () => {
  disposeRegisteredClientRuntimeActivities();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
  await clearRecentAnalyses();
});

describe("recent session store actions", () => {
  it("restores an in-progress interview follow-up from local history", async () => {
    useAppStore
      .getState()
      .setAnalysis(analysisFixture(), storedPdf("interview-pdf"));
    useAppStore.getState().setModule("interview");
    useAppStore.getState().setInterviewPlan(interviewPlanFixture());
    useAppStore.getState().addEvaluation(mainEvaluationFixture());
    useAppStore.getState().updateInterviewProgress({
      followUpRound: 1,
      askedFollowUps: ["请说明个人行动。"],
      followUpEvaluation: followUpEvaluationFixture(),
      transcript: "历史记录中的追问草稿",
      transcriptSource: "text",
    });

    await useAppStore.getState().goHome();
    useAppStore.getState().reset();
    await expect(
      useAppStore.getState().openRecentSession("resume-history"),
    ).resolves.toBe(true);

    expect(useAppStore.getState()).toMatchObject({
      stage: "workspace",
      module: "interview",
      evaluations: [{ evaluation: { questionId: "history-question-1" } }],
      interviewProgress: {
        schemaVersion: 1,
        questionIndex: 0,
        followUpRound: 1,
        askedFollowUps: ["请说明个人行动。"],
        followUpEvaluation: {
          evaluation: {
            questionId: "history-question-1::follow-up:1",
            overallScore: 84,
          },
        },
        transcript: "历史记录中的追问草稿",
      },
    });
  });

  it("goes home without destroying state and restores the PDF-backed session", async () => {
    const analysis = analysisFixture();
    const pdfBlob = storedPdf("pdf-bytes");
    useAppStore.getState().setAnalysis(analysis, pdfBlob);
    useAppStore.getState().updateJobDraft({
      jdText: "高级产品经理岗位，负责 AI 产品规划、数据分析与跨团队项目交付。",
      jobTitle: "高级产品经理",
      seniority: "senior",
      location: "上海",
      language: "zh-CN",
    });
    useAppStore.getState().setModule("job");
    const stopActivity = vi.fn();
    registerClientRuntimeDisposer(stopActivity);

    await useAppStore.getState().goHome();

    expect(stopActivity).toHaveBeenCalledOnce();
    expect(useAppStore.getState()).toMatchObject({
      stage: "upload",
      module: "job",
      analysis: { resume: { id: "resume-history", revision: 2 } },
      recentAnalyses: [
        {
          id: "resume-history",
          originalFileName: "candidate-history.pdf",
          hasPdf: true,
        },
      ],
    });

    useAppStore.getState().reset();
    expect(useAppStore.getState().analysis).toBeNull();

    await expect(
      useAppStore.getState().openRecentSession("resume-history"),
    ).resolves.toBe(true);
    const restored = useAppStore.getState();
    expect(restored.stage).toBe("workspace");
    expect(restored.module).toBe("job");
    expect(restored.analysis?.resume.revision).toBe(2);
    expect(restored.analysis?.originalPdfBase64).toBe(btoa("pdf-bytes"));
    expect(restored.undoStack).toEqual([]);
    expect(restored.jobDraft).toEqual({
      jdText: "高级产品经理岗位，负责 AI 产品规划、数据分析与跨团队项目交付。",
      jobTitle: "高级产品经理",
      seniority: "senior",
      location: "上海",
      language: "zh-CN",
    });
  });

  it("deletes one recent record and clears the matching hidden current session", async () => {
    useAppStore.getState().setAnalysis(analysisFixture(), storedPdf("pdf"));
    await useAppStore.getState().goHome();

    const stopActivity = vi.fn();
    const cacheCleaner = vi.fn();
    registerClientRuntimeDisposer(stopActivity);
    const unregisterCacheCleaner = registerClientCacheCleaner(cacheCleaner);
    const analysisRequest = beginAnalysisRequest();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const apiRequest = trackedFetch("/api/slow-delete");
    const apiRequestAborted = expect(apiRequest).rejects.toMatchObject({
      name: "AbortError",
    });

    await useAppStore.getState().deleteRecentSession("resume-history");
    await apiRequestAborted;

    expect(useAppStore.getState().recentAnalyses).toEqual([]);
    expect(useAppStore.getState().analysis).toBeNull();
    expect(useAppStore.getState().stage).toBe("upload");
    expect(analysisRequest.signal.aborted).toBe(true);
    expect(stopActivity).toHaveBeenCalledOnce();
    expect(cacheCleaner).toHaveBeenCalledOnce();
    unregisterCacheCleaner();
  });

  it("archives a hydrated active session when recent records are refreshed", async () => {
    useAppStore.setState({
      analysis: analysisFixture(),
      stage: "workspace",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      sourcePdfBlob: null,
      recentAnalyses: [],
    });

    await useAppStore.getState().refreshRecentSessions();

    expect(useAppStore.getState().recentAnalyses).toEqual([
      expect.objectContaining({ id: "resume-history", hasPdf: false }),
    ]);
  });

  it("keeps an explicitly unarchived current analysis out of recent records", async () => {
    useAppStore.getState().setAnalysis(analysisFixture(), storedPdf("pdf"));
    await useAppStore.getState().goHome();
    useAppStore.getState().setStage("workspace");
    useAppStore.setState((state) => ({
      analysis: state.analysis
        ? {
            ...state.analysis,
            scorecard: {
              ...state.analysis.scorecard,
              total: 91,
              summary: "尚未归档的当前修改。",
            },
          }
        : null,
    }));

    useAppStore.getState().goHomeWithoutArchive();
    await useAppStore.getState().refreshRecentSessions();

    expect(useAppStore.getState()).toMatchObject({
      stage: "upload",
      analysis: { scorecard: { total: 91 } },
      recentAnalyses: [],
      archiveSuppressedForResumeId: "resume-history",
    });
    expect(await getRecentAnalysis("resume-history")).toMatchObject({
      score: 78,
      summary: "重点经历清楚，可继续补强结果证据。",
    });

    useAppStore.getState().setStage("workspace");
    await useAppStore.getState().goHome();

    expect(useAppStore.getState()).toMatchObject({
      stage: "upload",
      recentAnalyses: [{ id: "resume-history", score: 91 }],
      archiveSuppressedForResumeId: null,
    });
  });

  it("reattaches the exact original PDF without rerunning analysis", async () => {
    const originalFile = new File(
      ["%PDF-1.7\nresume"],
      "candidate-history.pdf",
      { type: "application/pdf" },
    );
    useAppStore.getState().setAnalysis(analysisFixture(), originalFile);
    await useAppStore.getState().goHome();
    useAppStore.setState({
      stage: "workspace",
      analysis: analysisFixture(),
      sourcePdfBlob: null,
    });
    const originalResume = useAppStore.getState().analysis?.resume;

    await useAppStore.getState().attachOriginalPdf(originalFile);

    expect(useAppStore.getState().analysis?.resume).toEqual(originalResume);
    expect(useAppStore.getState().analysis?.originalPdfBase64).toBe(
      btoa("%PDF-1.7\nresume"),
    );
    expect(useAppStore.getState().recentAnalyses[0]).toMatchObject({
      id: "resume-history",
      hasPdf: true,
    });
    await expect(
      useAppStore
        .getState()
        .attachOriginalPdf(
          new File(["%PDF-1.7"], "another.pdf", { type: "application/pdf" }),
        ),
    ).rejects.toThrow("请选择原文件");
    await expect(
      useAppStore.getState().attachOriginalPdf(
        new File(["%PDF-1.7\ndifferent"], "candidate-history.pdf", {
          type: "application/pdf",
        }),
      ),
    ).rejects.toThrow("与分析时的原文件不一致");
  });

  it("keeps the workspace open when IndexedDB cannot save or delete", async () => {
    vi.stubGlobal("indexedDB", undefined);
    useAppStore.getState().setAnalysis(analysisFixture());

    await useAppStore.getState().goHome();

    expect(useAppStore.getState()).toMatchObject({
      stage: "workspace",
      homeNavigationPending: false,
      analysis: { resume: { id: "resume-history" } },
    });
    expect(useAppStore.getState().error).toContain("无法安全保存当前会话");

    useAppStore.getState().goHomeWithoutArchive();
    expect(useAppStore.getState()).toMatchObject({
      stage: "upload",
      analysis: { resume: { id: "resume-history" } },
      recentAnalyses: [],
      error: null,
    });

    await expect(
      useAppStore.getState().deleteRecentSession("resume-history"),
    ).rejects.toThrow("本机记录存储不可用");
    expect(useAppStore.getState().analysis?.resume.id).toBe("resume-history");
  });

  it("removes an expired hidden home session and its recent record", async () => {
    useAppStore.getState().setAnalysis(analysisFixture(), storedPdf("pdf"));
    await useAppStore.getState().goHome();
    useAppStore.setState({
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });

    await useAppStore.getState().enforceLocalExpiry();

    expect(useAppStore.getState()).toMatchObject({
      stage: "upload",
      analysis: null,
      expiresAt: null,
      recentAnalyses: [],
    });
  });

  it("clears IndexedDB and both session generations only after the explicit action", async () => {
    useAppStore.getState().setAnalysis(analysisFixture(), storedPdf("pdf"));
    await useAppStore.getState().goHome();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY_V2, "legacy");
    window.sessionStorage.setItem(
      API_RATE_LIMIT_SESSION_KEY,
      "session-history-test-1234",
    );
    const request = beginAnalysisRequest();
    const cacheCleaner = vi.fn();
    const unregisterCacheCleaner = registerClientCacheCleaner(cacheCleaner);
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    trackObjectUrl("blob:resume-clear-test");
    expect(hasActiveAnalysisRequest()).toBe(true);

    await useAppStore.getState().clearAllLocalData();

    expect(useAppStore.getState().analysis).toBeNull();
    expect(useAppStore.getState().recentAnalyses).toEqual([]);
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY_V2)).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY_V3)).toBeNull();
    expect(
      window.sessionStorage.getItem(API_RATE_LIMIT_SESSION_KEY),
    ).toBeNull();
    expect(request.signal.aborted).toBe(true);
    expect(hasActiveAnalysisRequest()).toBe(false);
    expect(cacheCleaner).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:resume-clear-test");
    expect(trackedObjectUrlCountForTests()).toBe(0);
    unregisterCacheCleaner();
  });
});

describe("v2 to v3 session migration", () => {
  it("renames the legacy undo field without dropping its snapshots", () => {
    const legacySnapshot = { resume: { id: "legacy" } };
    expect(
      migratePersistedSessionState({
        history: [legacySnapshot],
        stage: "workspace",
      }),
    ).toMatchObject({
      stage: "workspace",
      undoStack: [legacySnapshot],
    });
  });

  it("strips an orphaned PDF payload from malformed legacy undo data", () => {
    const migrated = migratePersistedSessionState({
      history: [
        {
          resume: { id: "legacy" },
          originalPdfBase64: "JVBERi0xLjc=",
        },
      ],
    });

    expect(migrated.undoStack).toEqual([{ resume: { id: "legacy" } }]);
    expect(JSON.stringify(migrated)).not.toContain("JVBERi0xLjc=");
  });

  it("keeps the migrated undo stack through the actual persist merge", () => {
    const analysis = analysisFixture();
    analysis.resume.createdAt = new Date(Date.now() - 60_000).toISOString();
    const snapshot = {
      resume: analysis.resume,
      suggestions: analysis.suggestions,
      scorecard: analysis.scorecard,
      claims: analysis.claims,
      evidence: analysis.evidence,
      stories: analysis.stories,
    };

    const merged = mergePersistedSessionState(
      { history: [snapshot], stage: "workspace", analysis },
      useAppStore.getState(),
    );

    expect(merged.undoStack).toEqual([snapshot]);
    expect(merged.stage).toBe("workspace");
  });

  it("keeps a legacy baseline session on the upload screen", () => {
    const analysis = analysisFixture();
    analysis.processing.capabilityVersions["resume.score"] =
      "resume.score@1.0.0";
    analysis.processing.capabilityVersions["resume.suggest"] =
      "resume.suggest@1.0.0";
    analysis.processing.aiAnalysis = undefined;

    const merged = mergePersistedSessionState(
      { stage: "workspace", module: "job", analysis },
      useAppStore.getState(),
    );

    expect(merged.stage).toBe("upload");
    expect(merged.module).toBe("resume");
    expect(merged.analysis).toBe(analysis);
  });

  it("normalizes incompatible interview progress instead of crossing plans", () => {
    const analysis = analysisFixture();
    const interviewPlan = interviewPlanFixture();

    const merged = mergePersistedSessionState(
      {
        stage: "workspace",
        analysis,
        interviewPlan,
        evaluations: "invalid-evaluations",
        interviewProgress: {
          schemaVersion: 1,
          sourceResumeId: "another-resume",
          sourceResumeRevision: 2,
          planFingerprint: "another-plan",
          questionIndex: 99,
          followUpRound: 1,
          askedFollowUps: ["不属于当前计划的追问"],
          followUpEvaluation: null,
          transcript: "不应串入当前简历的草稿",
          transcriptSource: "text",
        },
      },
      useAppStore.getState(),
    );

    expect(merged.evaluations).toEqual([]);
    expect(merged.interviewProgress).toMatchObject({
      schemaVersion: 1,
      sourceResumeId: "resume-history",
      sourceResumeRevision: 2,
      questionIndex: 0,
      followUpRound: 0,
      askedFollowUps: [],
      followUpEvaluation: null,
      transcript: "",
    });
  });

  it("normalizes a legacy missing deadline from the original analysis creation time", () => {
    const createdAt = Date.now() - 6 * 60 * 60 * 1000;
    const analysis = analysisFixture();
    analysis.resume.createdAt = new Date(createdAt).toISOString();

    const merged = mergePersistedSessionState(
      { stage: "workspace", analysis, expiresAt: "invalid" },
      useAppStore.getState(),
    );

    expect(merged.expiresAt).toBe(
      new Date(createdAt + 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it("clears rehydrated analysis when neither its deadline nor creation time is trustworthy", async () => {
    const analysis = analysisFixture();
    analysis.resume.createdAt = undefined;
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY_V3,
      JSON.stringify({
        state: { stage: "workspace", analysis, expiresAt: "invalid" },
        version: 3,
      }),
    );

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState()).toMatchObject({
      stage: "upload",
      analysis: null,
      expiresAt: null,
    });
  });

  it("moves the v2 storage value to the v3 key and removes the old copy", () => {
    const values = new Map([[SESSION_STORAGE_KEY_V2, "persisted-v2"]]);
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };

    expect(readMigratedSessionValue(storage)).toBe("persisted-v2");
    expect(values.get(SESSION_STORAGE_KEY_V3)).toBe("persisted-v2");
    expect(values.has(SESSION_STORAGE_KEY_V2)).toBe(false);
  });
});
