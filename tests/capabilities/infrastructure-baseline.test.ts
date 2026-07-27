import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CAPABILITY_IDS, CapabilityInvocationError } from "@/lib/capabilities";
import { createDefaultCapabilityRegistry } from "@/lib/baseline";
import { ResumeASTSchema } from "@/lib/domain";

const tesseractMocks = vi.hoisted(() => {
  const terminate = vi.fn(async () => undefined);
  const recognize = vi.fn(async () => ({
    data: {
      text: "TypeScript platform",
      confidence: 92,
      blocks: [
        {
          text: "TypeScript platform",
          confidence: 92,
          bbox: { x0: 10, y0: 5, x1: 190, y1: 35 },
        },
      ],
    },
  }));
  return {
    createWorker: vi.fn(async () => ({ recognize, terminate })),
    recognize,
    terminate,
  };
});

vi.mock("tesseract.js", () => ({ createWorker: tesseractMocks.createWorker }));

const context = {
  sessionId: "session-infra",
  locale: "zh-CN" as const,
  traceId: "trace-infra",
  deadlineAt: new Date(Date.now() + 120_000).toISOString(),
  grantedDataScopes: [
    "original_pdf",
    "page_image",
    "selected_text",
    "source_blocks",
    "resume_ast",
    "rendered_document",
    "ui_render_tree",
    "system_metadata",
    "eval_fixtures",
  ] as const,
};

const ast = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "en-US",
  contact: {
    name: "Alex Chen",
    headline: "Software Engineer",
    email: "alex@example.com",
    links: [],
  },
  summary: "Builds reliable TypeScript products.",
  sections: [
    {
      id: "experience",
      type: "experience",
      title: "Experience",
      entries: [
        {
          id: "role-1",
          title: "Software Engineer",
          organization: "Example Tech",
          current: true,
          bullets: ["Built a TypeScript platform and reduced response time by 35%."],
          keywords: ["TypeScript"],
          sourceBlockIds: [],
        },
      ],
      sourceBlockIds: [],
    },
  ],
});

let sourcePdfBase64 = "";
let renderedPdfBase64 = "";
let renderedSha256 = "";

beforeAll(async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Alex Chen - TypeScript Software Engineer", { x: 54, y: 780, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
  sourcePdfBase64 = Buffer.from(await document.save()).toString("base64");

  const rendered = await createDefaultCapabilityRegistry().invoke<unknown, { pdfBase64: string; sha256: string }>(
    "resume.render",
    { resumeId: "resume-infra", revision: 0, ast, template: "professional" },
    context,
  );
  renderedPdfBase64 = rendered.data.pdfBase64;
  renderedSha256 = rendered.data.sha256;
});

describe("infrastructure capability contracts", () => {
  it("publishes JSON schemas and a baseline for all 31 capabilities", () => {
    const registry = createDefaultCapabilityRegistry();
    expect(CAPABILITY_IDS).toHaveLength(31);
    for (const id of CAPABILITY_IDS) {
      const description = registry.describe(id);
      expect(description.available, id).toBe(true);
      expect(description.inputJsonSchema, `${id} input schema`).toBeTruthy();
      expect(description.outputJsonSchema, `${id} output schema`).toBeTruthy();
    }
  });

  it("document.parse performs native PDF extraction with base64 previews", async () => {
    const result = await createDefaultCapabilityRegistry().invoke<unknown, { pageCount: number; text: string; pages: Array<{ previewBase64: string }>; blocks: unknown[] }>(
      "document.parse",
      { pdfBase64: sourcePdfBase64, fileName: "fixture.pdf" },
      context,
    );
    expect(result.data.pageCount).toBe(1);
    expect(result.data.text).toContain("TypeScript");
    expect(result.data.pages[0].previewBase64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(result.data.blocks.length).toBeGreaterThan(0);
  });

  it("document.parse refuses access without the original PDF scope", async () => {
    await expect(
      createDefaultCapabilityRegistry().invoke(
        "document.parse",
        { pdfBase64: sourcePdfBase64, fileName: "fixture.pdf" },
        { ...context, grantedDataScopes: ["source_blocks"] },
      ),
    ).rejects.toMatchObject({ code: "DATA_SCOPE_DENIED" } satisfies Partial<CapabilityInvocationError>);
  });

  it("document.ocr maps recognized image regions into source blocks", async () => {
    const result = await createDefaultCapabilityRegistry().invoke<unknown, { text: string; confidence: number; blocks: Array<{ source: string; bbox: { width: number } }> }>(
      "document.ocr",
      { imageBase64: Buffer.from("mock-image").toString("base64"), mimeType: "image/png", width: 200, height: 100 },
      context,
    );
    expect(result.data.text).toBe("TypeScript platform");
    expect(result.data.confidence).toBe(0.92);
    expect(result.data.blocks[0]).toMatchObject({ source: "ocr", bbox: { width: 0.9 } });

    const options = (tesseractMocks.createWorker.mock.calls.at(-1) as unknown[] | undefined)?.[2] as
      | { cacheMethod?: string; gzip?: boolean; langPath?: string }
      | undefined;
    expect(options).toMatchObject({ cacheMethod: "none", gzip: true });
    expect(path.isAbsolute(options?.langPath ?? "")).toBe(true);
    expect(options?.langPath).not.toMatch(/^https?:\/\//i);
    expect(tesseractMocks.terminate).toHaveBeenCalled();
  });

  it("document.ocr terminates its worker when the caller cancels", async () => {
    const controller = new AbortController();
    let rejectRecognition: ((error: Error) => void) | undefined;
    const priorRecognitions = tesseractMocks.recognize.mock.calls.length;
    const priorTerminations = tesseractMocks.terminate.mock.calls.length;
    tesseractMocks.recognize.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectRecognition = reject;
      }),
    );
    tesseractMocks.terminate.mockImplementationOnce(async () => {
      rejectRecognition?.(new Error("worker terminated"));
      return undefined;
    });

    const invocation = createDefaultCapabilityRegistry().invoke(
      "document.ocr",
      { imageBase64: Buffer.from("mock-image").toString("base64"), mimeType: "image/png", width: 200, height: 100 },
      { ...context, signal: controller.signal },
    );
    await vi.waitFor(() => expect(tesseractMocks.recognize.mock.calls.length).toBe(priorRecognitions + 1));
    controller.abort();

    await expect(invocation).rejects.toMatchObject({ code: "CANCELLED" });
    await vi.waitFor(() => expect(tesseractMocks.terminate.mock.calls.length).toBeGreaterThan(priorTerminations));
  });

  it("document.segment restores reading order and section roles", async () => {
    const blocks = [
      { id: "b2", pageIndex: 0, order: 1, text: "Built products", bbox: { x: 0.1, y: 0.2, width: 0.8, height: 0.03 }, source: "native", confidence: 1, role: "unknown" },
      { id: "b1", pageIndex: 0, order: 0, text: "Experience", bbox: { x: 0.1, y: 0.1, width: 0.3, height: 0.03 }, source: "native", confidence: 1, role: "unknown", style: { fontWeight: 700 } },
    ];
    const result = await createDefaultCapabilityRegistry().invoke<unknown, { blocks: Array<{ id: string; role: string }>; segments: Array<{ kind: string; blockIds: string[] }> }>(
      "document.segment",
      { blocks },
      context,
    );
    expect(result.data.blocks.map((block) => block.id)).toEqual(["b1", "b2"]);
    expect(result.data.blocks[0].role).toBe("heading");
    expect(result.data.segments[0]).toMatchObject({ kind: "section", blockIds: ["b1", "b2"] });
  });

  it("layout.recommend returns all three ranked templates", async () => {
    const result = await createDefaultCapabilityRegistry().invoke<unknown, { recommendedTemplate: string; rankings: unknown[]; estimatedPages: number }>(
      "layout.recommend",
      { ast, targetPages: 1 },
      context,
    );
    expect(["professional", "minimal", "compact"]).toContain(result.data.recommendedTemplate);
    expect(result.data.rankings).toHaveLength(3);
    expect(result.data.estimatedPages).toBeGreaterThan(0);
  });

  it("resume.render produces a hashed searchable PDF payload", () => {
    expect(Buffer.from(renderedPdfBase64, "base64").subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(renderedSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("export.audit verifies hash, PDF structure, text coverage, and its hard gate", async () => {
    const registry = createDefaultCapabilityRegistry();
    const valid = await registry.invoke<unknown, { sha256: string; report: { pageCount: number; checks: Array<{ id: string }> }; searchableText: boolean; astContentCovered: boolean; hardGate: { passed: boolean } }>(
      "export.audit",
      { resumeId: "resume-infra", revision: 0, ast, template: "professional", pdfBase64: renderedPdfBase64, expectedSha256: renderedSha256 },
      context,
    );
    expect(valid.data.sha256).toBe(renderedSha256);
    expect(valid.data.report.pageCount).toBeGreaterThan(0);
    expect(valid.data.report.checks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "valid-pdf" }), expect.objectContaining({ id: "sha256" })]));
    expect(valid.data.searchableText).toBe(true);
    expect(valid.data.astContentCovered).toBe(true);

    const mismatch = await registry.invoke<unknown, { hardGate: { passed: boolean; blockingCheckIds: string[] } }>(
      "export.audit",
      { resumeId: "resume-infra", revision: 0, ast, template: "professional", pdfBase64: renderedPdfBase64, expectedSha256: "0".repeat(64) },
      context,
    );
    expect(mismatch.data.hardGate).toMatchObject({ passed: false, blockingCheckIds: expect.arrayContaining(["sha256"]) });
  });

  it("preserves section text when the same section also contains entries", async () => {
    const combinedAst = ResumeASTSchema.parse({
      ...ast,
      sections: ast.sections.map((section, index) =>
        index === 0 ? { ...section, text: "Platform ownership and delivery scope." } : section,
      ),
    });
    const registry = createDefaultCapabilityRegistry();
    const rendered = await registry.invoke<unknown, { pdfBase64: string; sha256: string }>(
      "resume.render",
      { resumeId: "resume-combined", revision: 3, ast: combinedAst, template: "professional" },
      context,
    );
    const audited = await registry.invoke<unknown, { astContentCovered: boolean; hardGate: { passed: boolean } }>(
      "export.audit",
      {
        resumeId: "resume-combined",
        revision: 3,
        ast: combinedAst,
        template: "professional",
        pdfBase64: rendered.data.pdfBase64,
        expectedSha256: rendered.data.sha256,
      },
      context,
    );
    expect(audited.data.astContentCovered).toBe(true);
    expect(audited.data.hardGate.passed).toBe(true);
  });

  it("preserves every summary section in the rendered PDF", async () => {
    const multiSummaryAst = ResumeASTSchema.parse({
      ...ast,
      sections: [
        {
          id: "summary-focus",
          type: "summary",
          title: "Focus",
          text: "Owns platform delivery from discovery to rollout.",
          entries: [],
          sourceBlockIds: [],
        },
        {
          id: "summary-collaboration",
          type: "summary",
          title: "Collaboration",
          text: "Aligns engineering, design, and operations around measurable outcomes.",
          entries: [],
          sourceBlockIds: [],
        },
        ...ast.sections,
      ],
    });
    const registry = createDefaultCapabilityRegistry();
    const rendered = await registry.invoke<unknown, { pdfBase64: string; sha256: string }>(
      "resume.render",
      {
        resumeId: "resume-multi-summary",
        revision: 4,
        ast: multiSummaryAst,
        template: "professional",
      },
      context,
    );
    const audited = await registry.invoke<
      unknown,
      {
        astContentCovered: boolean;
        hardGate: { passed: boolean; blockingCheckIds: string[] };
      }
    >(
      "export.audit",
      {
        resumeId: "resume-multi-summary",
        revision: 4,
        ast: multiSummaryAst,
        template: "professional",
        pdfBase64: rendered.data.pdfBase64,
        expectedSha256: rendered.data.sha256,
      },
      context,
    );

    expect(audited.data.astContentCovered).toBe(true);
    expect(audited.data.hardGate).toEqual({
      passed: true,
      blockingCheckIds: [],
    });
  });

  it("speech.transcribe only normalizes browser-recognized text and declares that limitation", async () => {
    const result = await createDefaultCapabilityRegistry().invoke<unknown, { transcript: string; source: string; audioProcessed: boolean }>(
      "speech.transcribe",
      { browserTranscript: "  我负责   TypeScript 平台  ", locale: "zh-CN", browserConfidence: 0.88 },
      context,
    );
    expect(result.data).toMatchObject({ transcript: "我负责 TypeScript 平台", source: "browser-speech-recognition", audioProcessed: false });
    expect(result.warnings.map((warning) => warning.code)).toContain("BROWSER_TRANSCRIPT_ONLY");
  });

  it("accessibility.audit runs WCAG-oriented checks on a structured UI fixture", async () => {
    const result = await createDefaultCapabilityRegistry().invoke<unknown, { passed: boolean; score: number; findings: unknown[] }>(
      "accessibility.audit",
      {
        fixtureId: "ui-good",
        nodes: [
          { id: "heading", role: "heading", text: "Resume review", headingLevel: 1, contrastRatio: 7 },
          { id: "accept", role: "button", accessibleName: "Accept suggestion", interactive: true, focusable: true, hasVisibleFocus: true, targetWidth: 32, targetHeight: 32, contrastRatio: 4.8 },
        ],
      },
      context,
    );
    expect(result.data).toMatchObject({ passed: true, score: 100, findings: [] });
  });

  it("security.audit enforces the document, privacy, and Skill runtime boundaries", async () => {
    const result = await createDefaultCapabilityRegistry().invoke<unknown, { passed: boolean; findings: unknown[] }>(
      "security.audit",
      {
        fixtureId: "secure-runtime",
        documentWorker: { networkPolicy: "none", runsAsRoot: false, readOnlyFilesystem: true, resourceLimits: true },
        privacy: { retentionHours: 24, logsRawContent: false, audio: { mode: "not_collected" }, piiRedactedBeforeExternalProcessing: true },
        skillRuntime: { staticAllowlist: true, secretsExposed: false, untrustedInputCanGrantPermissions: false },
      },
      context,
    );
    expect(result.data).toMatchObject({ passed: true, findings: [] });
  });

  it("security.audit only requires deletion when audio is collected transiently", async () => {
    const registry = createDefaultCapabilityRegistry();
    const secureFixture = {
      documentWorker: { networkPolicy: "none" as const, runsAsRoot: false, readOnlyFilesystem: true, resourceLimits: true },
      skillRuntime: { staticAllowlist: true, secretsExposed: false, untrustedInputCanGrantPermissions: false },
    };

    const deleted = await registry.invoke<unknown, { passed: boolean; findings: Array<{ controlId: string }> }>(
      "security.audit",
      {
        ...secureFixture,
        fixtureId: "transient-audio-deleted",
        privacy: {
          retentionHours: 24,
          logsRawContent: false,
          audio: { mode: "transient", deletedAfterTranscription: true },
          piiRedactedBeforeExternalProcessing: true,
        },
      },
      context,
    );
    expect(deleted.data).toMatchObject({ passed: true, findings: [] });

    const retained = await registry.invoke<unknown, { passed: boolean; findings: Array<{ controlId: string }> }>(
      "security.audit",
      {
        ...secureFixture,
        fixtureId: "transient-audio-retained",
        privacy: {
          retentionHours: 24,
          logsRawContent: false,
          audio: { mode: "transient", deletedAfterTranscription: false },
          piiRedactedBeforeExternalProcessing: true,
        },
      },
      context,
    );
    expect(retained.data.passed).toBe(false);
    expect(retained.data.findings.map((finding) => finding.controlId)).toContain("audio-delete");
  });

  it("llm.eval deterministically evaluates structured fixture assertions", async () => {
    const result = await createDefaultCapabilityRegistry().invoke<unknown, { passed: boolean; passRate: number; passedAssertions: number }>(
      "llm.eval",
      {
        suiteId: "resume-score-v1",
        fixtures: [
          {
            id: "score-1",
            actual: { total: 86, summary: "Evidence-based resume", warnings: [] },
            assertions: [
              { path: "/total", operator: "gte", expected: 80 },
              { path: "/summary", operator: "contains", expected: "Evidence" },
              { path: "/warnings", operator: "exists" },
            ],
          },
        ],
      },
      context,
    );
    expect(result.data).toMatchObject({ passed: true, passRate: 100, passedAssertions: 3 });
  });
});
