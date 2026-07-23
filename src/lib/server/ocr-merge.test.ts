import { describe, expect, it } from "vitest";

import type { SourceBlock } from "@/lib/domain";

import { selectOcrBlocksForPage } from "./ocr-merge";

function sourceBlock(
  id: string,
  source: SourceBlock["source"],
  text: string,
  bbox: SourceBlock["bbox"],
  options: { pageIndex?: number; confidence?: number } = {},
): SourceBlock {
  return {
    id,
    pageIndex: options.pageIndex ?? 0,
    order: 0,
    text,
    bbox,
    source,
    confidence: options.confidence ?? (source === "ocr" ? 0.84 : 1),
    role: "paragraph",
  };
}

describe("selectOcrBlocksForPage", () => {
  const native = sourceBlock("native-title", "native", "Senior Product Manager", {
    x: 0.1,
    y: 0.1,
    width: 0.5,
    height: 0.06,
  });

  it("keeps the complete OCR result for a scan page", () => {
    const duplicate = sourceBlock("ocr-duplicate", "ocr", "Senior Product Manager", native.bbox);
    const missing = sourceBlock("ocr-body", "ocr", "Built an onboarding workflow", {
      x: 0.1,
      y: 0.5,
      width: 0.7,
      height: 0.08,
    });

    expect(selectOcrBlocksForPage("scan", [native], [duplicate, missing])).toEqual([duplicate, missing]);
  });

  it("removes exact, normalized, and fuzzy duplicates near native text", () => {
    const candidates = [
      sourceBlock("exact", "ocr", "Senior Product Manager", native.bbox),
      sourceBlock("normalized", "ocr", "SENIOR  PRODUCT-MANAGER", native.bbox),
      sourceBlock("fuzzy", "ocr", "Senior Product Managcr", native.bbox),
    ];

    expect(selectOcrBlocksForPage("mixed", [native], candidates)).toEqual([]);
  });

  it("rejects novel OCR text when native blocks already cover its region", () => {
    const covered = sourceBlock("covered", "ocr", "Unreliable OCR replacement", {
      x: 0.11,
      y: 0.105,
      width: 0.45,
      height: 0.05,
    });

    expect(selectOcrBlocksForPage("mixed", [native], [covered])).toEqual([]);
  });

  it("keeps text from an uncovered region with its original bbox and confidence", () => {
    const missing = sourceBlock(
      "missing",
      "ocr",
      "Launched three industry editions",
      { x: 0.1, y: 0.55, width: 0.72, height: 0.075 },
      { confidence: 0.91 },
    );

    const selected = selectOcrBlocksForPage("mixed", [native], [missing]);

    expect(selected).toEqual([missing]);
    expect(selected[0].bbox).toEqual(missing.bbox);
    expect(selected[0].confidence).toBe(0.91);
  });

  it("does not treat the same text elsewhere on a page as a duplicate", () => {
    const repeatedElsewhere = sourceBlock("repeated", "ocr", native.text, {
      x: 0.1,
      y: 0.72,
      width: 0.5,
      height: 0.06,
    });

    expect(selectOcrBlocksForPage("mixed", [native], [repeatedElsewhere])).toEqual([repeatedElsewhere]);
  });

  it("removes duplicate lines but preserves missing lines from a larger OCR region", () => {
    const mixedRegion = sourceBlock(
      "mixed-region",
      "ocr",
      "Senior Product Manager\nImproved activation from 42% to 61%",
      { x: 0.08, y: 0.08, width: 0.84, height: 0.52 },
      { confidence: 0.88 },
    );

    expect(selectOcrBlocksForPage("mixed", [native], [mixedRegion])).toEqual([
      {
        ...mixedRegion,
        text: "Improved activation from 42% to 61%",
      },
    ]);
  });

  it("uses native union area instead of double-counting overlapping boxes", () => {
    const nativeLeft = sourceBlock("native-left", "native", "A", {
      x: 0.1,
      y: 0.3,
      width: 0.03,
      height: 0.1,
    });
    const duplicateGeometry = sourceBlock("native-left-copy", "native", "B", nativeLeft.bbox);
    const candidate = sourceBlock("candidate", "ocr", "Missing image label", {
      x: 0.1,
      y: 0.3,
      width: 0.1,
      height: 0.1,
    });

    expect(selectOcrBlocksForPage("mixed", [nativeLeft, duplicateGeometry], [candidate])).toEqual([candidate]);
  });

  it("does not add OCR blocks to a digital page", () => {
    const candidate = sourceBlock("candidate", "ocr", "Unexpected OCR", {
      x: 0.1,
      y: 0.5,
      width: 0.5,
      height: 0.05,
    });

    expect(selectOcrBlocksForPage("digital", [native], [candidate])).toEqual([]);
  });
});
