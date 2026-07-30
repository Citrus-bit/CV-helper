import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { MAX_PDF_BYTES, parsePdf, PdfInputError } from "./pdf";

describe("parsePdf input safety", () => {
  it("rejects non-PDF data", async () => {
    await expect(parsePdf(new TextEncoder().encode("not a pdf"))).rejects.toMatchObject({
      code: "NOT_PDF",
    } satisfies Partial<PdfInputError>);
  });

  it("rejects oversized files before parsing", async () => {
    const bytes = new Uint8Array(MAX_PDF_BYTES + 1);
    bytes.set(new TextEncoder().encode("%PDF-"));
    await expect(parsePdf(bytes)).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("reports the raster preview dimensions separately from PDF point dimensions", async () => {
    const document = await PDFDocument.create();
    document.addPage([595, 842]);

    const parsed = await parsePdf(new Uint8Array(await document.save()), "scaled.pdf");

    expect(parsed.pages[0]).toMatchObject({ width: 595, height: 842 });
    expect(parsed.pages[0].previewWidth).toBe(1120);
    expect(parsed.pages[0].previewHeight).toBeGreaterThan(1500);
    expect(parsed.pages[0].previewWidth).not.toBe(parsed.pages[0].width);
  });

  it("maps native text boxes from the baseline and CropBox into viewport coordinates", async () => {
    const document = await PDFDocument.create();
    const page = document.addPage([600, 800]);
    page.setCropBox(50, 100, 500, 600);
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText("Viewport aligned text", {
      x: 100,
      y: 600,
      size: 20,
      font,
    });

    const parsed = await parsePdf(
      new Uint8Array(await document.save()),
      "cropped.pdf",
    );
    const block = parsed.blocks.find((candidate) =>
      candidate.text.includes("Viewport aligned text"),
    );

    expect(parsed.pages[0]).toMatchObject({ width: 500, height: 600 });
    expect(block).toBeDefined();
    expect(block!.bbox.x).toBeCloseTo(0.1, 3);
    expect(block!.bbox.y).toBeLessThan(100 / 600);
    expect(block!.bbox.y + block!.bbox.height).toBeGreaterThan(100 / 600);
    expect(block!.bbox.height).toBeCloseTo(20 / 600, 3);
  });

  it("rejects pages whose logical dimensions exceed the render safety limit", async () => {
    const document = await PDFDocument.create();
    document.addPage([2_500, 2_500]);

    await expect(parsePdf(new Uint8Array(await document.save()), "oversized-page.pdf")).rejects.toMatchObject({
      code: "PAGE_TOO_LARGE",
    } satisfies Partial<PdfInputError>);
  });
});
