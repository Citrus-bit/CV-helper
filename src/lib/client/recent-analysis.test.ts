import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AnalysisBundle } from "./contracts";
import { stableId } from "@/lib/baseline/utils";
import {
  applyRecentAnalysisPolicy,
  clearRecentAnalyses,
  getRecentAnalysis,
  inferSummarySource,
  listRecentAnalyses,
  RecentAnalysisGenerationError,
  resetObservedGenerationForTests,
  saveRecentAnalysis,
  type RecentAnalysisPayload,
} from "./recent-analysis";

function analysisFixture(
  id: string,
  sourceVersion = "resume.score@1.0.0",
): AnalysisBundle {
  return {
    resume: {
      id,
      revision: 0,
      originalFileName: `${id}.pdf`,
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
      resumeId: id,
      resumeRevision: 0,
      total: 72,
      summary: "结构清楚，成果证据仍可加强。",
      sourceVersion,
      dimensions: [
        ["impact", 12, 25],
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
    pagePreviews: ["data:image/png;base64,cHJldmlldw=="],
    originalPdfBase64: "cGRm",
    processing: {
      extractionMode: "native",
      durationMs: 10,
      capabilityVersions: {},
    },
  };
}

function payload(id: string, sourceVersion?: string): RecentAnalysisPayload {
  return {
    analysis: analysisFixture(id, sourceVersion),
    jobMatch: null,
    interviewPlan: null,
    evaluations: [],
    module: "resume",
    selectedSuggestionId: null,
    selectedTemplate: "professional",
  };
}

const start = Date.parse("2026-07-23T08:00:00.000Z");

async function bumpGenerationOutsideRepository() {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("resume-analysis-assistant", 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        "recent-analysis-meta",
        "readwrite",
      );
      const store = transaction.objectStore("recent-analysis-meta");
      const request = store.get("generation");
      request.onsuccess = () => {
        const current = Number(request.result?.value ?? 0);
        store.put({ key: "generation", value: current + 1 });
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

beforeEach(async () => {
  await clearRecentAnalyses();
});

afterEach(async () => {
  await clearRecentAnalyses();
});

describe("recent analysis IndexedDB repository", () => {
  it("stores the PDF as a Blob while removing binary strings from the structured snapshot", async () => {
    const pdfBlob = new Blob(["local-pdf"], { type: "application/pdf" });
    const summaries = await saveRecentAnalysis(
      {
        payload: payload("resume-ai", "resume.score@2.0.0"),
        expiresAt: new Date(start + 60_000).toISOString(),
        pdfBlob,
      },
      start,
    );

    expect(summaries).toEqual([
      expect.objectContaining({
        id: "resume-ai",
        hasPdf: true,
        summarySource: "ai",
      }),
    ]);
    const record = await getRecentAnalysis("resume-ai", start + 1);
    expect(record?.pdfBlob).toBeInstanceOf(Blob);
    expect(record?.pdfBlob?.size).toBe(pdfBlob.size);
    expect(record?.pdfSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.payload.analysis.originalPdfBase64).toBeUndefined();
    expect(record?.payload.analysis.pagePreviews).toEqual([]);
  });

  it("round-trips versioned interview progress without requiring audio data", async () => {
    const archived = payload("resume-interview");
    const question = {
      id: "question-1",
      locale: "zh-CN" as const,
      prompt: "请介绍一个项目。",
      category: "resume" as const,
      difficulty: "intermediate" as const,
      roleFamilies: [],
      skills: [],
      followUps: ["请说明个人行动。"],
      scoringAnchors: [],
      source: "test",
      generated: false,
      referenceQuestionIds: [],
    };
    const plan = {
      sourceResumeId: "resume-interview",
      sourceResumeRevision: 0,
      questions: [question],
      stories: [],
      durationMinutes: 20,
      maxFollowUps: 2,
    };
    archived.module = "interview";
    archived.interviewPlan = plan;
    archived.evaluations = [
      {
        sourceResumeId: "resume-interview",
        sourceResumeRevision: 0,
        evaluation: {
          questionId: question.id,
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
      },
    ];
    archived.interviewSetupStage = "intro";
    archived.interviewProgress = {
      schemaVersion: 1,
      sourceResumeId: "resume-interview",
      sourceResumeRevision: 0,
      planFingerprint: stableId("interview_plan", JSON.stringify(plan)),
      questionIndex: 0,
      followUpRound: 1,
      askedFollowUps: ["请说明个人行动。"],
      followUpEvaluation: null,
      transcript: "尚未提交的文字草稿",
      transcriptSource: "text",
    };

    await saveRecentAnalysis(
      {
        payload: archived,
        expiresAt: new Date(start + 60_000).toISOString(),
      },
      start,
    );

    const record = await getRecentAnalysis("resume-interview", start + 1);
    expect(record?.payload.interviewProgress).toEqual(
      archived.interviewProgress,
    );
    expect(record?.payload).not.toHaveProperty("audio");
  });

  it("keeps only the ten newest unexpired records", async () => {
    for (let index = 0; index < 11; index += 1) {
      await saveRecentAnalysis(
        {
          payload: payload(`resume-${index}`),
          expiresAt: new Date(start + 60_000).toISOString(),
          pdfBlob: new Blob([String(index)], { type: "application/pdf" }),
        },
        start + index,
      );
    }

    const records = await listRecentAnalyses(start + 20);
    expect(records).toHaveLength(10);
    expect(records.map((record) => record.id)).not.toContain("resume-0");

    expect(await listRecentAnalyses(start + 60_001)).toEqual([]);
  });

  it("releases the oldest PDF before deleting records when the byte budget is exceeded", async () => {
    await saveRecentAnalysis(
      {
        payload: payload("oldest"),
        expiresAt: new Date(start + 60_000).toISOString(),
        pdfBlob: new Blob([new Uint8Array(2_048)], { type: "application/pdf" }),
      },
      start,
    );
    await saveRecentAnalysis(
      {
        payload: payload("newest"),
        expiresAt: new Date(start + 60_000).toISOString(),
        pdfBlob: new Blob([new Uint8Array(2_048)], { type: "application/pdf" }),
      },
      start + 1,
    );
    const oldest = await getRecentAnalysis("oldest", start + 2);
    const newest = await getRecentAnalysis("newest", start + 2);
    expect(oldest).not.toBeNull();
    expect(newest).not.toBeNull();

    const retained = applyRecentAnalysisPolicy([oldest!, newest!], start + 2, {
      maxRecords: 10,
      maxBytes: oldest!.byteSize + newest!.byteSize - oldest!.pdfBytes + 1,
    });

    expect(retained).toHaveLength(2);
    expect(
      retained.find((record) => record.id === "oldest")?.pdfBlob,
    ).toBeUndefined();
    expect(
      retained.find((record) => record.id === "oldest")?.pdfSha256,
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(
      retained.find((record) => record.id === "newest")?.pdfBlob,
    ).toBeInstanceOf(Blob);
  });

  it("labels built-in summaries as rules and provider summaries as AI", () => {
    expect(inferSummarySource("resume.score@1.0.0")).toBe("rules");
    expect(inferSummarySource("builtin.resume.score@1.0.0")).toBe("rules");
    expect(inferSummarySource("provider.resume.score@1.0.0")).toBe("ai");
    expect(inferSummarySource("resume.score@2.0.0")).toBe("ai");
  });

  it("rejects a stale save after another context changes the generation", async () => {
    await listRecentAnalyses(start);
    await bumpGenerationOutsideRepository();

    await expect(
      saveRecentAnalysis(
        {
          payload: payload("stale-save"),
          expiresAt: new Date(start + 60_000).toISOString(),
        },
        start,
      ),
    ).rejects.toBeInstanceOf(RecentAnalysisGenerationError);

    expect(await getRecentAnalysis("stale-save", start)).toBeNull();
  });

  it("requires list or get initialization before a fresh context writes a nonzero generation", async () => {
    resetObservedGenerationForTests();
    const input = {
      payload: payload("cold-context-save"),
      expiresAt: new Date(start + 60_000).toISOString(),
    };

    await expect(saveRecentAnalysis(input, start)).rejects.toMatchObject({
      name: "RecentAnalysisGenerationError",
      reason: "uninitialized",
    });
    await expect(saveRecentAnalysis(input, start)).rejects.toMatchObject({
      reason: "uninitialized",
    });

    await listRecentAnalyses(start);
    await expect(saveRecentAnalysis(input, start)).resolves.toEqual([
      expect.objectContaining({ id: "cold-context-save" }),
    ]);
  });
});
