import { z } from "zod";

import {
  getCapabilityDescriptor,
  type Capability,
  type CapabilityContext,
  type CapabilityExecution,
  type CapabilityId,
} from "@/lib/capabilities";
import type { AuditCheck, SourceBlock } from "@/lib/domain";

import {
  DocumentOcrInputSchema,
  DocumentOcrOutputSchema,
  DocumentParseInputSchema,
  DocumentParseOutputSchema,
  DocumentSegmentInputSchema,
  DocumentSegmentOutputSchema,
  ExportAuditInputSchema,
  ExportAuditOutputSchema,
  LayoutRecommendInputSchema,
  LayoutRecommendOutputSchema,
  ResumeRenderInputSchema,
  ResumeRenderOutputSchema,
  type DocumentOcrInput,
  type DocumentParseInput,
  type DocumentSegmentInput,
  type ExportAuditInput,
  type LayoutRecommendInput,
  type ResumeRenderInput,
} from "./contracts";
import { clamp, normalizeText, stableId } from "./utils";

function defineCapability<I, O>(
  id: CapabilityId,
  inputSchema: z.ZodType<I>,
  outputSchema: z.ZodType<O>,
  execute: (
    input: I,
    context: CapabilityContext,
  ) => CapabilityExecution<O> | Promise<CapabilityExecution<O>>,
): Capability<I, O> {
  return {
    descriptor: getCapabilityDescriptor(id),
    inputSchema,
    outputSchema,
    execute,
  };
}

function decodeBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: true,
    verbosity: 0,
  });
  const document = await loadingTask.promise;
  try {
    return document.numPages;
  } finally {
    await loadingTask.destroy();
  }
}

export const documentParseCapability = defineCapability(
  "document.parse",
  DocumentParseInputSchema,
  DocumentParseOutputSchema,
  async (input: DocumentParseInput, context) => {
    const { parsePdf } = await import("@/lib/server/pdf");
    const parsed = await parsePdf(
      Uint8Array.from(decodeBase64(input.pdfBase64)),
      input.fileName,
      {
        enableOcr: false,
        signal: context.signal,
      },
    );
    const blocks: SourceBlock[] = parsed.blocks.map((block) => ({
      ...block,
      source: block.source === "pdf" ? "native" : "ocr",
      role: "unknown",
    }));
    return {
      data: {
        fileName: parsed.fileName,
        pageCount: parsed.pageCount,
        text: parsed.text,
        blocks,
        pages: parsed.pages.map((page) => ({
          pageIndex: page.pageIndex,
          width: page.width,
          height: page.height,
          previewWidth: page.previewWidth,
          previewHeight: page.previewHeight,
          source: page.source,
          nativeCharacterCount: page.nativeCharacterCount,
          previewMimeType: "image/png" as const,
          previewBase64: page.previewDataUrl.replace(
            /^data:image\/png;base64,/,
            "",
          ),
        })),
        warnings: parsed.warnings,
        extractionMode:
          parsed.extractionMode === "hybrid"
            ? ("mixed" as const)
            : parsed.extractionMode,
      },
      confidence: parsed.blocks.length ? 0.96 : 0.35,
      evidenceReferences: blocks.map((block) => block.id),
      warnings: parsed.warnings.map((message) => ({
        code: "PDF_PARSE_WARNING",
        message,
      })),
      usage: {
        inputUnits: decodeBase64(input.pdfBase64).byteLength,
        outputUnits: blocks.length,
      },
    };
  },
);

export const documentOcrCapability = defineCapability(
  "document.ocr",
  DocumentOcrInputSchema,
  DocumentOcrOutputSchema,
  async (input: DocumentOcrInput, context) => {
    const [{ createWorker }, { getOfflineTesseractOptions }] =
      await Promise.all([import("tesseract.js"), import("@/lib/server/ocr")]);
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    const terminate = () => {
      if (worker) void worker.terminate().catch(() => undefined);
    };
    context.signal?.addEventListener("abort", terminate, { once: true });
    let result: Awaited<
      ReturnType<Awaited<ReturnType<typeof createWorker>>["recognize"]>
    >;
    try {
      worker = await createWorker(
        input.language,
        undefined,
        getOfflineTesseractOptions(),
      );
      if (context.signal?.aborted) {
        const error = new Error("OCR was cancelled.");
        error.name = "AbortError";
        throw error;
      }
      result = await worker.recognize(decodeBase64(input.imageBase64));
    } finally {
      context.signal?.removeEventListener("abort", terminate);
      if (worker) await worker.terminate().catch(() => undefined);
    }
    const text = normalizeText(result.data.text);
    const confidence = clamp(result.data.confidence / 100, 0, 1);
    const recognizedBlocks = result.data.blocks ?? [];
    const blocks: SourceBlock[] = recognizedBlocks
      .map((block, index) => ({
        id: `p${input.pageIndex + 1}-ocr-${index + 1}`,
        pageIndex: input.pageIndex,
        order: index,
        text: normalizeText(block.text),
        source: "ocr" as const,
        confidence: clamp(block.confidence / 100, 0, 1),
        bbox: {
          x: clamp(block.bbox.x0 / input.width, 0, 1),
          y: clamp(block.bbox.y0 / input.height, 0, 1),
          width: clamp((block.bbox.x1 - block.bbox.x0) / input.width, 0, 1),
          height: clamp((block.bbox.y1 - block.bbox.y0) / input.height, 0, 1),
        },
        role: "paragraph" as const,
      }))
      .filter((block) => block.text.length > 0);
    if (!blocks.length && text) {
      blocks.push({
        id: `p${input.pageIndex + 1}-ocr-1`,
        pageIndex: input.pageIndex,
        order: 0,
        text,
        source: "ocr",
        confidence,
        bbox: { x: 0, y: 0, width: 1, height: 1 },
        role: "paragraph",
      });
    }
    const warnings = [
      ...(!text
        ? [{ code: "OCR_EMPTY", message: "OCR 未从该页面识别出可用文字。" }]
        : []),
      ...(text && confidence < 0.7
        ? [
            {
              code: "OCR_LOW_CONFIDENCE",
              message: "OCR 置信度较低，写入简历前必须人工核对。",
            },
          ]
        : []),
    ];
    return {
      data: { text, confidence, blocks, engine: "tesseract.js" as const },
      confidence,
      evidenceReferences: blocks.map((block) => block.id),
      warnings,
      usage: {
        inputUnits: decodeBase64(input.imageBase64).byteLength,
        outputUnits: text.length,
      },
    };
  },
);

function inferredRole(block: SourceBlock): SourceBlock["role"] {
  if (block.role !== "unknown") return block.role;
  const text = normalizeText(block.text);
  if (block.bbox.y >= 0.94) return "footer";
  if (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?86[-\s]?)?1[3-9]\d{9}/i.test(
      text,
    )
  )
    return "contact";
  if (/^[•·●▪■\-–—]\s*/.test(text)) return "list-item";
  if (
    text.length <= 32 &&
    !/[。.!?？！；;，,]$/.test(text) &&
    (/经历|教育|技能|项目|证书|奖项|简介|experience|education|skills?|projects?|summary|profile/i.test(
      text,
    ) ||
      (block.style?.fontWeight ?? 0) >= 600)
  )
    return "heading";
  return "paragraph";
}

export const documentSegmentCapability = defineCapability(
  "document.segment",
  DocumentSegmentInputSchema,
  DocumentSegmentOutputSchema,
  (input: DocumentSegmentInput) => {
    const blocks = input.blocks
      .slice()
      .sort(
        (left, right) =>
          left.pageIndex - right.pageIndex ||
          left.order - right.order ||
          left.bbox.y - right.bbox.y ||
          left.bbox.x - right.bbox.x,
      )
      .map((block, order) => ({ ...block, order, role: inferredRole(block) }));
    const mutableSegments: Array<{
      id: string;
      pageIndex: number;
      kind: "contact" | "section" | "body" | "footer";
      heading?: string;
      blockIds: string[];
      texts: string[];
    }> = [];
    let active: (typeof mutableSegments)[number] | undefined;
    for (const block of blocks) {
      const kind =
        block.role === "contact"
          ? "contact"
          : block.role === "footer"
            ? "footer"
            : block.role === "heading"
              ? "section"
              : "body";
      const startsSegment =
        !active ||
        block.pageIndex !== active.pageIndex ||
        kind !== "body" ||
        active.kind === "contact" ||
        active.kind === "footer";
      if (startsSegment) {
        active = {
          id: stableId(
            "segment",
            `${block.pageIndex}:${block.id}:${block.text}`,
          ),
          pageIndex: block.pageIndex,
          kind,
          heading:
            block.role === "heading" ? normalizeText(block.text) : undefined,
          blockIds: [],
          texts: [],
        };
        mutableSegments.push(active);
      }
      const current = active;
      if (!current) continue;
      current.blockIds.push(block.id);
      current.texts.push(normalizeText(block.text));
    }
    const segments = mutableSegments.map(({ texts, ...segment }) => ({
      ...segment,
      text: texts.filter(Boolean).join("\n"),
    }));
    return {
      data: { blocks, segments },
      confidence: blocks.length ? 0.78 : 0.4,
      evidenceReferences: blocks.map((block) => block.id),
      warnings: blocks.length
        ? []
        : [{ code: "NO_SOURCE_BLOCKS", message: "没有可供分块的文本块。" }],
    };
  },
);

const TEMPLATE_CAPACITY = {
  professional: 2_500,
  minimal: 2_200,
  compact: 3_300,
} as const;

function astContentUnits(input: LayoutRecommendInput["ast"]): number {
  const values = [
    input.contact.name,
    input.contact.headline,
    input.contact.email,
    input.contact.phone,
    input.contact.location,
    input.summary,
    ...input.sections.flatMap((section) => [
      section.title,
      section.text,
      ...section.entries.flatMap((entry) => [
        entry.title,
        entry.organization,
        entry.subtitle,
        entry.summary,
        ...entry.bullets,
      ]),
    ]),
  ];
  return values
    .filter((value): value is string => Boolean(value))
    .reduce((total, value) => total + value.length, 0);
}

export const layoutRecommendCapability = defineCapability(
  "layout.recommend",
  LayoutRecommendInputSchema,
  LayoutRecommendOutputSchema,
  (input: LayoutRecommendInput) => {
    const units = astContentUnits(input.ast);
    const density =
      units > 2_500
        ? ("dense" as const)
        : units < 1_100
          ? ("light" as const)
          : ("balanced" as const);
    const baseScores =
      density === "dense"
        ? { professional: 80, minimal: 68, compact: 94 }
        : density === "light"
          ? { professional: 86, minimal: 94, compact: 72 }
          : { professional: 94, minimal: 86, compact: 82 };
    const templates = ["professional", "minimal", "compact"] as const;
    const rankings = templates
      .map((template) => {
        const estimatedPages = Math.max(
          1,
          Math.ceil(units / TEMPLATE_CAPACITY[template]),
        );
        const pagePenalty = Math.abs(estimatedPages - input.targetPages) * 12;
        const preference = input.preferredTemplate === template ? 4 : 0;
        return {
          template,
          score: clamp(baseScores[template] - pagePenalty + preference, 0, 100),
          estimatedPages,
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          templates.indexOf(left.template) - templates.indexOf(right.template),
      );
    const selected = rankings[0];
    const reasons = [
      density === "dense"
        ? "内容密度较高，优先减少分页与大段留白。"
        : density === "light"
          ? "内容较精简，优先保持清晰层级与舒展留白。"
          : "内容密度适中，优先采用招聘场景中稳定的单栏层级。",
      `预计使用 ${selected.template} 模板输出 ${selected.estimatedPages} 页。`,
      ...(input.preferredTemplate
        ? [`已将用户偏好的 ${input.preferredTemplate} 模板纳入排序。`]
        : []),
    ];
    return {
      data: {
        recommendedTemplate: selected.template,
        estimatedPages: selected.estimatedPages,
        density,
        reasons,
        rankings,
      },
      confidence: 0.82,
      evidenceReferences: input.ast.sections.map((section) => section.id),
    };
  },
);

export const resumeRenderCapability = defineCapability(
  "resume.render",
  ResumeRenderInputSchema,
  ResumeRenderOutputSchema,
  async (input: ResumeRenderInput) => {
    const [{ toRenderableResume }, { renderResumePdf }] = await Promise.all([
      import("@/lib/server/export"),
      import("@/lib/server/typst"),
    ]);
    const pdf = await renderResumePdf(
      toRenderableResume(input.ast),
      input.template,
    );
    const bytes = Uint8Array.from(pdf);
    const [digest, pageCount] = await Promise.all([
      sha256(bytes),
      pdfPageCount(bytes),
    ]);
    return {
      data: {
        mimeType: "application/pdf" as const,
        pdfBase64: Buffer.from(bytes).toString("base64"),
        sha256: digest,
        byteLength: bytes.byteLength,
        pageCount,
        template: input.template,
      },
      confidence: 0.96,
      evidenceReferences: input.ast.sections.map((section) => section.id),
      usage: {
        inputUnits: astContentUnits(input.ast),
        outputUnits: bytes.byteLength,
      },
    };
  },
);

function auditCheck(
  id: string,
  label: string,
  status: AuditCheck["status"],
  details: string,
): AuditCheck {
  return { id, label, status, details };
}

export const exportAuditCapability = defineCapability(
  "export.audit",
  ExportAuditInputSchema,
  ExportAuditOutputSchema,
  async (input: ExportAuditInput, context) => {
    const pdf = Uint8Array.from(decodeBase64(input.pdfBase64));
    const digest = await sha256(pdf);
    const validMagic =
      pdf.byteLength >= 5 &&
      new TextDecoder("ascii").decode(pdf.slice(0, 5)) === "%PDF-";
    let baseReport: z.infer<typeof ExportAuditOutputSchema>["report"];
    if (validMagic) {
      try {
        const { astContentFragments, auditRenderedPdf, toRenderableResume } =
          await import("@/lib/server/export");
        baseReport = await auditRenderedPdf(
          Uint8Array.from(pdf),
          toRenderableResume(input.ast),
          {
            resumeId: input.resumeId,
            revision: input.revision,
            template: input.template,
            sourcePageCount: input.sourcePageCount,
          },
          astContentFragments(input.ast),
          {
            signal: context.signal,
            deadlineAt: context.deadlineAt,
          },
        );
      } catch (error) {
        baseReport = {
          resumeId: input.resumeId,
          resumeRevision: input.revision,
          template: input.template,
          artifactSha256: digest,
          sourcePageCount: input.sourcePageCount,
          pageCount: 0,
          downloadable: false,
          searchableText: false,
          contentComplete: false,
          hardGate: {
            passed: false,
            blockingCheckIds: ["valid-pdf", "quality-threshold"],
          },
          overallScore: 0,
          checks: [
            auditCheck(
              "valid-pdf",
              "PDF 结构",
              "fail",
              error instanceof Error ? error.message : "PDF 无法读取。",
            ),
          ],
          generatedAt: new Date().toISOString(),
        };
      }
    } else {
      baseReport = {
        resumeId: input.resumeId,
        resumeRevision: input.revision,
        template: input.template,
        artifactSha256: digest,
        sourcePageCount: input.sourcePageCount,
        pageCount: 0,
        downloadable: false,
        searchableText: false,
        contentComplete: false,
        hardGate: {
          passed: false,
          blockingCheckIds: ["valid-pdf", "quality-threshold"],
        },
        overallScore: 0,
        checks: [
          auditCheck(
            "valid-pdf",
            "PDF 结构",
            "fail",
            "文件缺少 %PDF- 文件头，禁止下载。",
          ),
        ],
        generatedAt: new Date().toISOString(),
      };
    }
    const hashMatches =
      !input.expectedSha256 || input.expectedSha256 === digest;
    const hashCheck = auditCheck(
      "sha256",
      "文件完整性",
      hashMatches ? "pass" : "fail",
      hashMatches
        ? `SHA-256: ${digest}`
        : `实际 SHA-256 ${digest} 与预期值不一致。`,
    );
    const checksWithoutIntegrity = baseReport.checks.filter(
      (item) => item.id !== "sha256" && item.id !== "quality-threshold",
    );
    const overallScore = hashMatches
      ? baseReport.overallScore
      : Math.max(0, baseReport.overallScore - 22);
    const qualityCheck = auditCheck(
      "quality-threshold",
      "综合质量门槛",
      overallScore >= 85 ? "pass" : "fail",
      overallScore >= 85
        ? "综合质量达到下载门槛。"
        : "综合质量低于 85 分，禁止下载。",
    );
    const checks = [...checksWithoutIntegrity, hashCheck, qualityCheck];
    const blockingCheckIds = checks
      .filter((item) => item.status === "fail")
      .map((item) => item.id);
    const searchableText =
      checks.find((item) => item.id === "searchable-text")?.status === "pass";
    const astContentCovered =
      checks.find((item) => item.id === "content-completeness")?.status ===
      "pass";
    const report = {
      ...baseReport,
      artifactSha256: digest,
      checks,
      overallScore,
      downloadable: blockingCheckIds.length === 0,
      searchableText,
      contentComplete: astContentCovered,
      hardGate: { passed: blockingCheckIds.length === 0, blockingCheckIds },
    };
    return {
      data: {
        sha256: digest,
        report,
        searchableText,
        astContentCovered,
        hardGate: { passed: report.downloadable, blockingCheckIds },
      },
      confidence: validMagic && baseReport.pageCount > 0 ? 0.96 : 1,
      evidenceReferences: input.ast.sections.map((section) => section.id),
      warnings: report.downloadable
        ? []
        : [
            {
              code: "EXPORT_BLOCKED",
              message: "导出质量硬门未通过，当前 PDF 禁止下载。",
            },
          ],
      usage: { inputUnits: pdf.byteLength, outputUnits: checks.length },
    };
  },
);

export const DOCUMENT_AND_EXPORT_CAPABILITIES = [
  documentParseCapability,
  documentOcrCapability,
  documentSegmentCapability,
  layoutRecommendCapability,
  resumeRenderCapability,
  exportAuditCapability,
] as const;
