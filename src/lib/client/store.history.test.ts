// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalysisBundle } from "./contracts";
import {
  beginAnalysisRequest,
  hasActiveAnalysisRequest,
} from "./analysis-request";
import { clearRecentAnalyses } from "./recent-analysis";
import { API_RATE_LIMIT_SESSION_KEY } from "./privacy";
import {
  registerClientCacheCleaner,
  trackObjectUrl,
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
      sourceVersion: "resume.score@1.0.0",
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
    pagePreviews: [],
    processing: {
      extractionMode: "native",
      durationMs: 12,
      capabilityVersions: {},
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
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useAppStore.getState().reset();
  window.sessionStorage.clear();
  await clearRecentAnalyses();
});

describe("recent session store actions", () => {
  it("goes home without destroying state and restores the PDF-backed session", async () => {
    const analysis = analysisFixture();
    const pdfBlob = storedPdf("pdf-bytes");
    useAppStore.getState().setAnalysis(analysis, pdfBlob);
    useAppStore.getState().setModule("job");

    await useAppStore.getState().goHome();

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
  });

  it("deletes one recent record and clears the matching hidden current session", async () => {
    useAppStore.getState().setAnalysis(analysisFixture(), storedPdf("pdf"));
    await useAppStore.getState().goHome();

    await useAppStore.getState().deleteRecentSession("resume-history");

    expect(useAppStore.getState().recentAnalyses).toEqual([]);
    expect(useAppStore.getState().analysis).toBeNull();
    expect(useAppStore.getState().stage).toBe("upload");
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
    useAppStore.getState().setAnalysis(analysisFixture());
    vi.stubGlobal("indexedDB", undefined);

    await useAppStore.getState().goHome();

    expect(useAppStore.getState()).toMatchObject({
      stage: "workspace",
      homeNavigationPending: false,
      analysis: { resume: { id: "resume-history" } },
    });
    expect(useAppStore.getState().error).toContain("无法安全保存当前会话");

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

  it("keeps the migrated undo stack through the actual persist merge", () => {
    const analysis = analysisFixture();
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
