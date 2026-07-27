import { describe, expect, it } from "vitest";

import type { AnalysisBundle } from "@/lib/client/contracts";
import {
  hasSessionExpired,
  normalizePersistedSessionExpiry,
} from "@/lib/client/store";

function analysisCreatedAt(createdAt?: string): AnalysisBundle {
  return {
    resume: {
      id: "resume-expiry",
      revision: 0,
      originalFileName: "expiry.pdf",
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
      createdAt,
    },
    evidence: [],
    claims: [],
    scorecard: {
      resumeId: "resume-expiry",
      resumeRevision: 0,
      total: 0,
      summary: "",
      dimensions: [],
    },
    suggestions: [],
    stories: [],
    processing: {
      extractionMode: "native",
      durationMs: 0,
      capabilityVersions: {},
    },
  };
}

describe("anonymous session expiry", () => {
  it("expires at the declared deadline and fails closed for missing or invalid deadlines", () => {
    const now = Date.parse("2026-07-22T12:00:00.000Z");
    expect(hasSessionExpired(null, now)).toBe(true);
    expect(hasSessionExpired("not-a-date", now)).toBe(true);
    expect(hasSessionExpired("2026-07-22T12:00:00.000Z", now)).toBe(true);
    expect(hasSessionExpired("2026-07-22T11:59:59.999Z", now)).toBe(true);
    expect(hasSessionExpired("2026-07-22T12:00:00.001Z", now)).toBe(false);
  });

  it("derives a legacy deadline from trusted creation time without extending its age", () => {
    const now = Date.parse("2026-07-22T12:00:00.000Z");
    const analysis = analysisCreatedAt("2026-07-22T06:00:00.000Z");

    expect(normalizePersistedSessionExpiry(null, analysis, now)).toBe(
      "2026-07-23T06:00:00.000Z",
    );
    expect(normalizePersistedSessionExpiry("invalid", analysis, now)).toBe(
      "2026-07-23T06:00:00.000Z",
    );
    expect(
      normalizePersistedSessionExpiry(
        "2026-08-30T00:00:00.000Z",
        analysis,
        now,
      ),
    ).toBe("2026-07-23T06:00:00.000Z");
  });

  it("rejects a legacy deadline when creation time is missing, invalid, or in the future", () => {
    const now = Date.parse("2026-07-22T12:00:00.000Z");

    expect(
      normalizePersistedSessionExpiry(null, analysisCreatedAt(), now),
    ).toBeNull();
    expect(
      normalizePersistedSessionExpiry(
        "invalid",
        analysisCreatedAt("invalid"),
        now,
      ),
    ).toBeNull();
    expect(
      normalizePersistedSessionExpiry(
        null,
        analysisCreatedAt("2026-07-22T12:00:00.001Z"),
        now,
      ),
    ).toBeNull();
  });
});
