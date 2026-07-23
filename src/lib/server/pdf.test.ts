import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
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

  it("rejects pages whose logical dimensions exceed the render safety limit", async () => {
    const document = await PDFDocument.create();
    document.addPage([2_500, 2_500]);

    await expect(parsePdf(new Uint8Array(await document.save()), "oversized-page.pdf")).rejects.toMatchObject({
      code: "PAGE_TOO_LARGE",
    } satisfies Partial<PdfInputError>);
  });
});
