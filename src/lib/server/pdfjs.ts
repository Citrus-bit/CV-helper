import "server-only";

export async function loadPdfJs() {
  // PDF.js uses this module as its Node fake worker; the explicit import also
  // keeps the asset in Next standalone output without duplicate trace rules.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}
