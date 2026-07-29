import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeBaselineCapability: vi.fn(),
  invokeRequiredAiCapability: vi.fn(),
}));

vi.mock("@/lib/baseline", () => ({
  invokeBaselineCapability: mocks.invokeBaselineCapability,
}));

vi.mock("@/lib/server/capability-runtime", () => ({
  invokeRequiredAiCapability: mocks.invokeRequiredAiCapability,
}));

import { POST } from "./route";
import { RenderResponseSchema } from "@/lib/client/contracts";

const ast = {
  schemaVersion: "1.0" as const,
  locale: "zh-CN" as const,
  contact: { name: "候选人", links: [] },
  sections: [],
};

function capabilityResult<T>(data: T, sourceVersion: string) {
  return {
    data,
    confidence: 1,
    evidenceReferences: [],
    warnings: [],
    sourceVersion,
    durationMs: 1,
    usedFallback: false,
  };
}

function auditResult(
  template: "professional" | "minimal" | "compact",
  passed: boolean,
) {
  const sha256 = template === "compact" ? "a".repeat(64) : "b".repeat(64);
  const blockingCheckIds = passed ? [] : ["text-visibility"];
  const hardGate = { passed, blockingCheckIds };
  return {
    sha256,
    searchableText: true,
    astContentCovered: true,
    hardGate,
    report: {
      resumeId: "resume-auto-layout",
      resumeRevision: 3,
      template,
      artifactSha256: sha256,
      pageCount: 1,
      downloadable: passed,
      searchableText: true,
      contentComplete: true,
      hardGate,
      overallScore: passed ? 100 : 78,
      checks: [
        {
          id: "text-visibility",
          label: "文字视觉可读性",
          status: passed ? ("pass" as const) : ("fail" as const),
        },
      ],
      generatedAt: "2026-07-28T00:00:00.000Z",
    },
  };
}

describe("POST /api/render Compact export", () => {
  beforeEach(() => {
    mocks.invokeBaselineCapability.mockReset();
    mocks.invokeRequiredAiCapability.mockReset();
  });

  it("always renders Compact even when a stale client requests another template", async () => {
    mocks.invokeBaselineCapability.mockImplementation(
      async (id: string, input: { template?: string }) => {
        if (id === "resume.render") {
          return capabilityResult(
            {
              mimeType: "application/pdf",
              pdfBase64: "Y29tcGFjdA==",
              sha256: "a".repeat(64),
              byteLength: 8,
              pageCount: 1,
              template: input.template,
            },
            "resume.render@1.0.0",
          );
        }
        return capabilityResult(
          auditResult(input.template as "compact", true),
          "export.audit@1.0.0",
        );
      },
    );

    const response = await POST(
      new Request("http://localhost/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: "resume-auto-layout",
          revision: 3,
          ast,
          template: "professional",
          sourcePageCount: 1,
        }),
      }),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const result = RenderResponseSchema.parse(await response.json());
    expect(result).toMatchObject({
      template: "compact",
      hardGate: { passed: true, blockingCheckIds: [] },
      report: { downloadable: true, template: "compact" },
      generation: {
        attempts: 1,
        aiRepairApplied: false,
      },
    });
    expect(
      mocks.invokeBaselineCapability.mock.calls.map(
        ([id, input]) => `${id}:${input.template ?? "-"}`,
      ),
    ).toEqual([
      "resume.render:compact",
      "export.audit:compact",
    ]);
    expect(mocks.invokeRequiredAiCapability).not.toHaveBeenCalled();
  });

  it("returns the failed Compact candidate for client-side review", async () => {
    mocks.invokeBaselineCapability.mockImplementation(
      async (id: string, input: { template?: string }) => {
        if (id === "resume.render") {
          return capabilityResult(
            {
              mimeType: "application/pdf",
              pdfBase64: "Y29tcGFjdA==",
              sha256: "a".repeat(64),
              byteLength: 8,
              pageCount: 1,
              template: input.template,
            },
            "resume.render@1.0.0",
          );
        }
        return capabilityResult(
          auditResult("compact", false),
          "export.audit@1.0.0",
        );
      },
    );

    const response = await POST(
      new Request("http://localhost/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: "resume-auto-layout",
          revision: 3,
          ast,
          template: "professional",
        }),
      }),
    );
    const result = RenderResponseSchema.parse(await response.json());

    expect(result).toMatchObject({
      template: "compact",
      hardGate: { passed: false, blockingCheckIds: ["text-visibility"] },
      report: { downloadable: false, template: "compact" },
    });
  });
});
