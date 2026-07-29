import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeBaselineCapability: vi.fn(),
}));

vi.mock("@/lib/baseline", () => ({
  invokeBaselineCapability: mocks.invokeBaselineCapability,
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

describe("POST /api/render automatic layout fallback", () => {
  beforeEach(() => {
    mocks.invokeBaselineCapability.mockReset();
  });

  it("returns the next verified layout when the first candidate fails", async () => {
    mocks.invokeBaselineCapability.mockImplementation(
      async (id: string, input: { template?: string }) => {
        if (id === "layout.recommend") {
          return capabilityResult(
            {
              recommendedTemplate: "compact",
              estimatedPages: 1,
              density: "dense",
              reasons: ["内容密度较高。"],
              rankings: [
                { template: "compact", score: 94, estimatedPages: 1 },
                { template: "professional", score: 80, estimatedPages: 2 },
                { template: "minimal", score: 68, estimatedPages: 2 },
              ],
            },
            "layout.recommend@1.0.0",
          );
        }
        if (id === "resume.render") {
          const template = input.template as "professional" | "compact";
          const sha256 =
            template === "compact" ? "a".repeat(64) : "b".repeat(64);
          return capabilityResult(
            {
              mimeType: "application/pdf",
              pdfBase64: template === "compact" ? "Y29tcGFjdA==" : "cHJv",
              sha256,
              byteLength: 8,
              pageCount: 1,
              template,
            },
            "resume.render@1.0.0",
          );
        }
        return capabilityResult(
          auditResult(
            input.template as "professional" | "minimal" | "compact",
            input.template === "professional",
          ),
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
      template: "professional",
      hardGate: { passed: true, blockingCheckIds: [] },
      report: { downloadable: true, template: "professional" },
    });
    expect(
      mocks.invokeBaselineCapability.mock.calls.map(
        ([id, input]) => `${id}:${input.template ?? "-"}`,
      ),
    ).toEqual([
      "layout.recommend:-",
      "resume.render:compact",
      "export.audit:compact",
      "resume.render:professional",
      "export.audit:professional",
    ]);
    expect(response.headers.get("x-capability-trace")).toContain(
      "layout.recommend@1.0.0",
    );
  });
});
