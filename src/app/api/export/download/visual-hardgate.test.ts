import { createHash } from "node:crypto";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { ResumeASTSchema } from "@/lib/domain";
import { DEMO_RESUME_AST } from "@/lib/server/analysis";
import {
  astContentFragments,
  auditRenderedPdf,
  toRenderableResume,
} from "@/lib/server/export";
import { renderResumePdf } from "@/lib/server/typst";

import {
  MAX_EXPORT_DOWNLOAD_REQUEST_BYTES,
  POST as downloadExport,
} from "./route";

const WHITE_TEXT_AST = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "en-US",
  contact: {
    name: "Alex Chen",
    headline: "Product Manager",
    email: "alex.chen@example.com",
    links: [],
  },
  summary: "Builds reliable workflow products.",
  sections: [],
});

const EMPTY_AST = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "en-US",
  contact: { name: "", links: [] },
  sections: [],
});

const NARROW_COVER_AST = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "en-US",
  contact: {
    name: "Morgan Lee",
    headline: "Revenue Analyst",
    email: "morgan.lee@example.com",
    links: [],
  },
  summary: "Revenue grew from 17% to 29% across enterprise accounts.",
  sections: [],
});

const SPARSE_CHINESE_AST = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: {
    name: "林 晓 辰",
    headline: "产 品 经 理 | AI 增 长",
    email: "lin@example.com",
    links: [],
  },
  summary: "用 户 研 究 与 数 据 分 析 驱 动 产 品 决 策。",
  sections: [],
});

async function whiteTextPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const lines = [
    WHITE_TEXT_AST.contact.name,
    WHITE_TEXT_AST.contact.headline,
    WHITE_TEXT_AST.contact.email,
    WHITE_TEXT_AST.summary,
  ].filter((line): line is string => Boolean(line));
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 54,
      y: 760 - index * 28,
      size: 12,
      font,
      color: rgb(1, 1, 1),
    });
  });
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function pureWhitePdf() {
  const document = await PDFDocument.create();
  document.setSubject("visual-hardgate-blank-fixture-" + "x".repeat(1_200));
  const page = document.addPage([595, 842]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 595,
    height: 842,
    color: rgb(1, 1, 1),
  });
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function whiteTextCoveredByLinesPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const lines = [
    WHITE_TEXT_AST.contact.name,
    WHITE_TEXT_AST.contact.headline,
    WHITE_TEXT_AST.contact.email,
    WHITE_TEXT_AST.summary,
  ].filter((line): line is string => Boolean(line));
  lines.forEach((line, index) => {
    const y = 760 - index * 28;
    page.drawText(line, {
      x: 54,
      y,
      size: 12,
      font,
      color: rgb(1, 1, 1),
    });
    page.drawLine({
      start: { x: 50, y: y + 5 },
      end: { x: 330, y: y + 5 },
      thickness: 2,
      color: rgb(0, 0, 0),
    });
  });
  document.setSubject("line-overlay-fixture-" + "x".repeat(1_000));
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function coverTypstTextTail(
  pdf: Uint8Array,
  textNeedle: string,
  coveredWidthRatio = 0.1,
) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    verbosity: 0,
  });
  let target:
    | {
        pageIndex: number;
        x: number;
        baseline: number;
        width: number;
        height: number;
      }
    | undefined;
  try {
    const source = await loadingTask.promise;
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (!("str" in item) || !item.str.includes(textNeedle)) continue;
          target = {
            pageIndex: pageNumber - 1,
            x: item.transform[4],
            baseline: item.transform[5],
            width: item.width,
            height: Math.max(
              1,
              item.height ?? Math.abs(item.transform[3] ?? 0),
            ),
          };
          break;
        }
      } finally {
        page.cleanup();
      }
      if (target) break;
    }
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
  if (!target) throw new Error(`Missing Typst text fixture: ${textNeedle}`);

  const document = await PDFDocument.load(pdf);
  const page = document.getPages()[target.pageIndex];
  const coverWidth = target.width * coveredWidthRatio;
  page.drawRectangle({
    x: target.x + target.width - coverWidth,
    y: target.baseline - target.height * 0.22,
    width: coverWidth + 1,
    height: target.height * 1.25,
    color: rgb(1, 1, 1),
  });
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function narrowMiddleCoverPdf() {
  const document = await PDFDocument.create();
  document.setSubject("narrow-middle-cover-fixture-" + "x".repeat(1_000));
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const lines = [
    NARROW_COVER_AST.contact.name,
    NARROW_COVER_AST.contact.headline,
    NARROW_COVER_AST.contact.email,
    NARROW_COVER_AST.summary,
  ].filter((line): line is string => Boolean(line));
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 54,
      y: 760 - index * 28,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
  });
  const prefix = "Revenue grew from ";
  page.drawRectangle({
    x: 54 + font.widthOfTextAtSize(prefix, 12),
    y: 760 - 3 * 28 - 2,
    width: font.widthOfTextAtSize("17%", 12),
    height: 15,
    color: rgb(1, 1, 1),
  });
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function pageBombPdf() {
  const document = await PDFDocument.create();
  document.setSubject("page-budget-fixture-" + "x".repeat(1_000));
  for (let index = 0; index < 6; index += 1) {
    document.addPage([595, 842]);
  }
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function textObjectBombPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 5_001; index += 1) {
    page.drawText("x", {
      x: 40 + (index % 100),
      y: 700 - (index % 50),
      size: 8,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function characterBombPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("x".repeat(250_001), {
    x: 40,
    y: 700,
    size: 0.001,
    font,
    color: rgb(0, 0, 0),
  });
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function renderPixelBombPdf() {
  const document = await PDFDocument.create();
  document.setSubject("render-pixel-budget-fixture-" + "x".repeat(1_000));
  for (let index = 0; index < 5; index += 1) {
    document.addPage([2_000, 2_000]);
  }
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function overlapComparisonBombPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 708; index += 1) {
    page.drawText(index % 2 === 0 ? "x" : "y", {
      x: 54,
      y: 700,
      size: 8,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

async function requestDownload(
  pdf: Uint8Array,
  ast: Parameters<typeof toRenderableResume>[0],
  template: "professional" | "minimal" | "compact" = "minimal",
) {
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  return downloadExport(
    new Request("http://localhost/api/export/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resumeId: "visual-hardgate-fixture",
        revision: 1,
        ast,
        template,
        pdfBase64: Buffer.from(pdf).toString("base64"),
        expectedSha256: sha256,
      }),
    }),
  );
}

describe.sequential("export visual hard gate", () => {
  it("rejects white-on-white text even when the searchable text layer is complete", async () => {
    const pdf = await whiteTextPdf();
    const report = await auditRenderedPdf(
      pdf,
      toRenderableResume(WHITE_TEXT_AST),
      { resumeId: "white-text", revision: 1, template: "minimal" },
      astContentFragments(WHITE_TEXT_AST),
    );

    expect(
      report.checks.find((check) => check.id === "searchable-text")?.status,
    ).toBe("pass");
    expect(
      report.checks.find((check) => check.id === "content-completeness")
        ?.status,
    ).toBe("pass");
    expect(
      report.checks.find((check) => check.id === "visual-content")?.status,
    ).toBe("fail");
    expect(
      report.checks.find((check) => check.id === "text-visibility")?.status,
    ).toBe("fail");

    const response = await requestDownload(pdf, WHITE_TEXT_AST);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("visual-content");
  });

  it("rejects a pure-white PDF page", async () => {
    const pdf = await pureWhitePdf();
    expect(pdf.byteLength).toBeGreaterThan(800);

    const response = await requestDownload(pdf, EMPTY_AST);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("visual-content");
  });

  it("does not let high-contrast lines over white text satisfy text visibility", async () => {
    const pdf = await whiteTextCoveredByLinesPdf();
    const report = await auditRenderedPdf(
      pdf,
      toRenderableResume(WHITE_TEXT_AST),
      { resumeId: "line-overlay", revision: 1, template: "minimal" },
      astContentFragments(WHITE_TEXT_AST),
    );

    expect(
      report.checks.find((check) => check.id === "visual-content")?.status,
    ).toBe("pass");
    expect(
      report.checks.find((check) => check.id === "text-visibility")?.status,
    ).toBe("fail");
    expect(report.downloadable).toBe(false);
  });

  it("rejects a normal Typst resume when the final ten percent of a key bullet is covered", async () => {
    const resume = toRenderableResume(DEMO_RESUME_AST);
    const source = await renderResumePdf(resume, "professional");
    const pdf = await coverTypstTextTail(source, "61%", 0.1);
    const report = await auditRenderedPdf(
      pdf,
      resume,
      { resumeId: "covered-bullet-tail", revision: 1, template: "professional" },
      astContentFragments(DEMO_RESUME_AST),
    );

    expect(
      report.checks.find((check) => check.id === "content-completeness")
        ?.status,
    ).toBe("pass");
    expect(
      report.checks.find((check) => check.id === "text-visibility")?.status,
    ).toBe("fail");
    expect(report.downloadable).toBe(false);

    const response = await requestDownload(
      pdf,
      DEMO_RESUME_AST,
      "professional",
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("text-visibility");
  });

  it("rejects a narrow numeric span covered in the middle of a text object", async () => {
    const pdf = await narrowMiddleCoverPdf();
    const report = await auditRenderedPdf(
      pdf,
      toRenderableResume(NARROW_COVER_AST),
      { resumeId: "covered-middle-number", revision: 1, template: "minimal" },
      astContentFragments(NARROW_COVER_AST),
    );

    expect(
      report.checks.find((check) => check.id === "content-completeness")
        ?.status,
    ).toBe("pass");
    expect(
      report.checks.find((check) => check.id === "text-visibility")?.status,
    ).toBe("fail");
  });

  it("keeps normally rendered sparse Chinese text visible", async () => {
    const resume = toRenderableResume(SPARSE_CHINESE_AST);
    const pdf = await renderResumePdf(resume, "minimal");
    const report = await auditRenderedPdf(
      pdf,
      resume,
      { resumeId: "sparse-chinese", revision: 1, template: "minimal" },
      astContentFragments(SPARSE_CHINESE_AST),
    );

    expect(
      report.checks.find((check) => check.id === "text-visibility")?.status,
    ).toBe("pass");
  });

  it("rejects PDFs whose trusted page tree exceeds five pages", async () => {
    await expect(
      auditRenderedPdf(await pageBombPdf(), toRenderableResume(EMPTY_AST), {
        resumeId: "page-bomb",
        revision: 1,
        template: "minimal",
      }),
    ).rejects.toThrow("1 至 5 页");
  });

  it("rejects a text-object bomb before rendering or overlap comparison", async () => {
    await expect(
      auditRenderedPdf(
        await textObjectBombPdf(),
        toRenderableResume(EMPTY_AST),
        { resumeId: "text-bomb", revision: 1, template: "minimal" },
      ),
    ).rejects.toThrow("文字对象数");
  });

  it("rejects a single expanded text object above the character budget", async () => {
    await expect(
      auditRenderedPdf(
        await characterBombPdf(),
        toRenderableResume(EMPTY_AST),
        { resumeId: "character-bomb", revision: 1, template: "minimal" },
      ),
    ).rejects.toThrow("文字层字符数");
  });

  it("enforces one total pixel budget across all three page renders", async () => {
    await expect(
      auditRenderedPdf(
        await renderPixelBombPdf(),
        toRenderableResume(EMPTY_AST),
        { resumeId: "pixel-bomb", revision: 1, template: "minimal" },
      ),
    ).rejects.toThrow("总渲染像素量");
  });

  it("bounds sweep-line overlap comparisons", async () => {
    await expect(
      auditRenderedPdf(
        await overlapComparisonBombPdf(),
        toRenderableResume(EMPTY_AST),
        { resumeId: "overlap-bomb", revision: 1, template: "minimal" },
      ),
    ).rejects.toThrow("重叠比较量");
  });

  it("honors cooperative cancellation before PDF rendering", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      auditRenderedPdf(
        await whiteTextPdf(),
        toRenderableResume(WHITE_TEXT_AST),
        { resumeId: "cancelled", revision: 1, template: "minimal" },
        astContentFragments(WHITE_TEXT_AST),
        { signal: controller.signal },
      ),
    ).rejects.toThrow("已取消");
  });

  it("enforces an explicit audit deadline", async () => {
    await expect(
      auditRenderedPdf(
        await whiteTextPdf(),
        toRenderableResume(WHITE_TEXT_AST),
        { resumeId: "expired", revision: 1, template: "minimal" },
        astContentFragments(WHITE_TEXT_AST),
        { deadlineAt: Date.now() - 1 },
      ),
    ).rejects.toThrow("超过处理时限");
  });

  it("streams and rejects an oversized JSON body without Content-Length", async () => {
    const request = new Request("http://localhost/api/export/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array(MAX_EXPORT_DOWNLOAD_REQUEST_BYTES + 1),
    });
    expect(request.headers.get("content-length")).toBeNull();

    const response = await downloadExport(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      error: "待下载产物超过 16 MB 复核限制。",
    });
  });

  it.each(["professional", "minimal", "compact"] as const)(
    "keeps the normal bilingual Typst %s template downloadable",
    async (template) => {
      const resume = toRenderableResume(DEMO_RESUME_AST);
      const pdf = await renderResumePdf(resume, template);
      const report = await auditRenderedPdf(
        pdf,
        resume,
        { resumeId: `typst-${template}`, revision: 1, template },
        astContentFragments(DEMO_RESUME_AST),
      );

      expect(
        report.checks.find((check) => check.id === "text-visibility")?.status,
      ).toBe("pass");
      expect(report.downloadable).toBe(true);

      const response = await requestDownload(pdf, DEMO_RESUME_AST, template);
      expect(response.status, await response.clone().text()).toBe(200);
    },
  );
});
