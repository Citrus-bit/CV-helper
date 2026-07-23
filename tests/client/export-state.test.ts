import { describe, expect, it } from "vitest";

import type { AnalysisBundle, RenderResponse } from "@/lib/client/contracts";
import { isRenderForAnalysis } from "@/lib/client/store";

const sha256 = "a".repeat(64);
const analysis = {
  resume: { id: "resume-1", revision: 4 },
} as AnalysisBundle;
const render = {
  template: "professional",
  sha256,
  report: {
    resumeId: "resume-1",
    resumeRevision: 4,
    template: "professional",
    artifactSha256: sha256,
  },
} as RenderResponse;

describe("export revision guard", () => {
  it("accepts only the exact current resume artifact", () => {
    expect(isRenderForAnalysis(analysis, render)).toBe(true);
    expect(isRenderForAnalysis(analysis, { ...render, report: { ...render.report, resumeRevision: 3 } })).toBe(false);
    expect(isRenderForAnalysis(analysis, { ...render, report: { ...render.report, resumeId: "resume-2" } })).toBe(false);
    expect(isRenderForAnalysis(analysis, { ...render, report: { ...render.report, template: "minimal" } })).toBe(false);
    expect(isRenderForAnalysis(analysis, { ...render, report: { ...render.report, artifactSha256: "b".repeat(64) } })).toBe(false);
  });
});
