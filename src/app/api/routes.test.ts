import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { POST as analyze } from "@/app/api/analyze/route";
import { GET as capabilities } from "@/app/api/capabilities/route";
import { GET as demo } from "@/app/api/demo/route";
import { POST as evaluateInterview } from "@/app/api/interview/evaluate/route";
import { POST as planInterview } from "@/app/api/interview/plan/route";
import { POST as transcribeInterview } from "@/app/api/interview/transcribe/route";
import { POST as matchJob } from "@/app/api/job-match/route";
import { POST as render } from "@/app/api/render/route";
import { POST as downloadExport } from "@/app/api/export/download/route";
import {
  AnalysisBundleSchema,
  EvaluationResponseSchema,
  InterviewPlanSchema,
  JobMatchBundleSchema,
  RenderResponseSchema,
} from "@/lib/client/contracts";
import { FeatureAvailabilitySchema } from "@/lib/capabilities";
import { DEMO_RESUME_AST } from "@/lib/server/analysis";
import { MAX_PDF_BYTES } from "@/lib/server/pdf";
import { z } from "zod";

async function syntheticResumePdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = [
    "Alex Chen",
    "Product Manager",
    "alex.chen@example.com | +1 415 555 0100 | Shanghai",
    "Professional Summary",
    "Product manager focused on measurable workflow improvements.",
    "Work Experience",
    "Senior Product Manager | Example Inc | 2022 - Present",
    "Led a workflow redesign that improved activation from 42% to 61%.",
    "Coordinated engineering and design to launch three industry editions.",
    "Education",
    "MSc Management Science | Example University | 2018",
    "Skills",
    "Product strategy, SQL, user research, experimentation",
  ];
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 54,
      y: 790 - index * 44,
      size: index === 0 ? 20 : 11,
      font,
      color: rgb(0.08, 0.1, 0.12),
    });
  });
  return pdf.save();
}

async function analyzedFixture() {
  const bytes = await syntheticResumePdf();
  const fileBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(fileBuffer).set(bytes);
  const form = new FormData();
  form.set(
    "file",
    new File([fileBuffer], "alex-chen-resume.pdf", { type: "application/pdf" }),
  );
  const response = await analyze(
    new Request("http://localhost/api/analyze", { method: "POST", body: form }),
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return AnalysisBundleSchema.parse(await response.json());
}

describe.sequential("API routes", () => {
  it("reports only schema-valid capability availability", async () => {
    const response = await capabilities();
    expect(response.status, await response.clone().text()).toBe(200);
    const payload = z
      .array(FeatureAvailabilitySchema)
      .parse(await response.json());
    expect(payload).toHaveLength(30);
    expect(
      payload.every((item) => item.available && item.fallbackAvailable),
    ).toBe(true);
    expect(payload.find((item) => item.id === "resume.score")).toMatchObject({
      available: true,
      mode: "baseline",
    });
  });

  it("analyzes a native-text PDF and preserves its real original bytes", async () => {
    const analysis = await analyzedFixture();
    expect(
      Buffer.from(analysis.originalPdfBase64!, "base64")
        .subarray(0, 5)
        .toString("ascii"),
    ).toBe("%PDF-");
    expect(analysis.resume.parseMethod).toBe("native");
    expect(analysis.resume.sourceBlocks.length).toBeGreaterThan(5);
    expect(
      new Set(analysis.resume.sourceBlocks.map((block) => block.source)),
    ).toEqual(new Set(["native"]));
    expect(analysis.processing.capabilityVersions).toMatchObject({
      "document.parse": "document.parse@1.0.0",
      "document.segment": "document.segment@1.0.0",
      "prompt.guard": "prompt.guard@1.0.0",
      "pii.redact": "pii.redact@1.0.0",
    });
  });

  it("rejects an oversized multipart stream even without a Content-Length header", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=bounded-fixture",
      },
      body: new Uint8Array(MAX_PDF_BYTES + 512 * 1_024 + 1),
    });
    expect(request.headers.get("content-length")).toBeNull();

    const response = await analyze(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("builds a JD evidence matrix after guard and redaction", async () => {
    const analysis = await analyzedFixture();
    const jdText =
      "Senior Product Manager\nResponsible for B2B product strategy and experimentation.\nMust have SQL, user research, and cross-functional delivery experience.";
    const response = await matchJob(
      new Request("http://localhost/api/job-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jdText,
          resumeId: analysis.resume.id,
          revision: 7,
          ast: analysis.resume.ast,
          claims: analysis.claims,
          evidence: analysis.evidence,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-capability-trace")).toContain(
      "prompt.guard@1.0.0",
    );
    const result = JobMatchBundleSchema.parse(await response.json());
    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.mappings).toHaveLength(result.requirements.length);
    expect(result.summary).toContain("不代表录取");
    expect(result.sourceResumeRevision).toBe(7);
    expect(result.variant?.baseRevision).toBe(7);
    expect(result.job.rawText).toBe(jdText);
    expect(JSON.stringify(result.requirements)).not.toContain("UNTRUSTED_DOCUMENT_DATA");
  });

  it("retrieves six questions from the bilingual knowledge pack", async () => {
    const response = await planInterview(
      new Request("http://localhost/api/interview/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ast: DEMO_RESUME_AST, claims: [], stories: [] }),
      }),
    );
    expect(response.status).toBe(200);
    const result = InterviewPlanSchema.parse(await response.json());
    expect(result.questions).toHaveLength(6);
    expect(
      result.questions.every((question) =>
        question.source.includes("resume-assistant-editorial"),
      ),
    ).toBe(true);
    expect(result.maxFollowUps).toBe(2);
  });

  it("evaluates a redacted answer and checks resume consistency", async () => {
    const response = await evaluateInterview(
      new Request("http://localhost/api/interview/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: "q-test",
          question: "Tell me about a measurable workflow improvement.",
          answer:
            "I mapped the onboarding funnel, coordinated engineering and design, and improved activation from 42% to 61%. Contact me at alex.chen@example.com.",
          claims: [],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-capability-trace")).toContain(
      "pii.redact@1.0.0",
    );
    const result = EvaluationResponseSchema.parse(await response.json());
    expect(result.evaluation.overallScore).toBeGreaterThan(0);
    expect(result.evaluation.improvements.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("UNTRUSTED_DOCUMENT_DATA");
  });

  it("deduplicates repeated consistency findings while preserving different conflicts", async () => {
    const claims = [
      {
        id: "claim-1",
        text: "Led platform migration in 2023.",
        status: "supported",
      },
      {
        id: "claim-2",
        text: "Improved platform conversion by 20.",
        status: "supported",
      },
      {
        id: "claim-3",
        text: "Staged platform delivery across 8 teams.",
        status: "needs_evidence",
      },
    ].map((claim) => ({
      ...claim,
      sourceBlockIds: [],
      evidenceAssetIds: [],
      confidence: 0.8,
      missingInformation: [],
    }));
    const response = await evaluateInterview(
      new Request("http://localhost/api/interview/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: "q-dedup",
          question: "Tell me about a measurable platform improvement.",
          answer:
            "I led platform migration for 12 teams and improved conversion from 58 to 76 through staged delivery.",
          claims,
        }),
      }),
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const result = EvaluationResponseSchema.parse(await response.json());
    expect(result.consistencyWarnings).toEqual([
      "回答出现简历中没有的数值（12、58、76），请核对口径。",
      "关联简历声明本身仍待核对，请勿在回答中进一步扩大。",
    ]);
  });

  it("normalizes browser speech text through the transcription capability", async () => {
    const response = await transcribeInterview(
      new Request("http://localhost/api/interview/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          browserTranscript: "  我负责梳理流程，并将转化率提升了 19%。  ",
          locale: "zh-CN",
          browserConfidence: 0.91,
          isFinal: true,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-capability-trace")).toBe(
      "speech.transcribe@1.0.0",
    );
    expect(await response.json()).toMatchObject({
      transcript: "我负责梳理流程，并将转化率提升了 19%。",
      audioProcessed: false,
    });
  });

  it("renders and independently audits a real Typst PDF", async () => {
    const response = await render(
      new Request("http://localhost/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: "demo",
          revision: 2,
          ast: DEMO_RESUME_AST,
          template: "professional",
          sourcePageCount: 1,
        }),
      }),
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const result = RenderResponseSchema.parse(await response.json());
    const pdf = Buffer.from(result.pdfBase64, "base64");
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(result.report.checks.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "visual-content",
        "text-visibility",
        "content-completeness",
        "clipping",
        "overlap",
        "font-embedding",
        "ats-order",
      ]),
    );
    expect(
      result.report.checks.find((item) => item.id === "visual-content")?.status,
    ).toBe("pass");
    expect(
      result.report.checks.find((item) => item.id === "text-visibility")
        ?.status,
    ).toBe("pass");
    expect(result.report.downloadable).toBe(true);
    expect(result.sha256).toBe(result.report.artifactSha256);
    expect(result.hardGate).toEqual({ passed: true, blockingCheckIds: [] });
    expect(result.astContentCovered).toBe(true);

    const downloadResponse = await downloadExport(
      new Request("http://localhost/api/export/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: "demo",
          revision: 2,
          ast: DEMO_RESUME_AST,
          template: "professional",
          pdfBase64: result.pdfBase64,
          expectedSha256: result.sha256,
          sourcePageCount: 1,
        }),
      }),
    );
    expect(downloadResponse.status, await downloadResponse.clone().text()).toBe(
      200,
    );
    expect(downloadResponse.headers.get("x-artifact-sha256")).toBe(
      result.sha256,
    );
    expect(
      Buffer.from(await downloadResponse.arrayBuffer())
        .subarray(0, 5)
        .toString("ascii"),
    ).toBe("%PDF-");
    expect(result.report.checks.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "page-count-change",
        "font-size",
        "line-spacing",
        "orphan-heading",
      ]),
    );
  });

  it("blocks download when the confirmed preview hash does not match", async () => {
    const rendered = await render(
      new Request("http://localhost/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: "demo",
          revision: 2,
          ast: DEMO_RESUME_AST,
          template: "compact",
        }),
      }),
    );
    const result = RenderResponseSchema.parse(await rendered.json());
    const response = await downloadExport(
      new Request("http://localhost/api/export/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: "demo",
          revision: 2,
          ast: DEMO_RESUME_AST,
          template: "compact",
          pdfBase64: result.pdfBase64,
          expectedSha256: "0".repeat(64),
        }),
      }),
    );
    expect(response.status).toBe(409);
  });

  it("keeps a failed export audit non-downloadable", async () => {
    const response = await render(
      new Request("http://localhost/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: "empty",
          revision: 0,
          ast: {
            schemaVersion: "1.0",
            locale: "zh-CN",
            contact: { name: "", links: [] },
            sections: [],
          },
          template: "minimal",
        }),
      }),
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const result = RenderResponseSchema.parse(await response.json());
    expect(result.report.downloadable).toBe(false);
    expect(result.report.checks.some((item) => item.status === "fail")).toBe(
      true,
    );
  });

  it("serves a demo with a real original PDF", async () => {
    const response = await demo(new Request("http://localhost/api/demo"));
    expect(response.status).toBe(200);
    const result = AnalysisBundleSchema.parse(await response.json());
    expect(
      Buffer.from(result.originalPdfBase64!, "base64")
        .subarray(0, 5)
        .toString("ascii"),
    ).toBe("%PDF-");
    expect(result.pagePreviews[0]).toMatch(/^data:image\/png;base64,/);
  });
});
