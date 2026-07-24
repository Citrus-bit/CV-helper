import { describe, expect, it } from "vitest";

import {
  AtsAuditSchema,
  AtsFindingSchema,
  SourceBlockSchema,
} from "./schemas";

describe("source block typography schema", () => {
  const sourceBlock = {
    id: "native-heading",
    pageIndex: 0,
    order: 0,
    text: "Experience",
    bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.04 },
    source: "native" as const,
    confidence: 1,
  };

  it("accepts bounded native typography while keeping OCR style optional", () => {
    expect(
      SourceBlockSchema.parse({
        ...sourceBlock,
        style: {
          fontFamily: "ABCDEE+Helvetica-BoldOblique",
          fontSize: 14,
          fontWeight: 700,
          fontStyle: "italic",
        },
      }).style,
    ).toEqual({
      fontFamily: "ABCDEE+Helvetica-BoldOblique",
      fontSize: 14,
      fontWeight: 700,
      fontStyle: "italic",
    });
    expect(
      SourceBlockSchema.parse({
        ...sourceBlock,
        id: "ocr-body",
        source: "ocr",
      }).style,
    ).toBeUndefined();
    expect(
      SourceBlockSchema.safeParse({
        ...sourceBlock,
        style: { fontFamily: "x".repeat(257) },
      }).success,
    ).toBe(false);
  });
});

describe("ATS audit domain schemas", () => {
  it("normalizes finding sources and requires audit provenance", () => {
    expect(
      AtsFindingSchema.parse({
        code: "CONTACT_MISSING",
        severity: "error",
        message: "缺少可识别的联系方式。",
      }),
    ).toMatchObject({ sourceBlockIds: [] });

    expect(
      AtsAuditSchema.safeParse({
        score: 75,
        passed: false,
        findings: [],
      }).success,
    ).toBe(false);
    expect(
      AtsAuditSchema.parse({
        score: 75,
        passed: false,
        findings: [],
        sourceVersion: "resume.atsAudit@1.0.0",
      }),
    ).toMatchObject({ sourceVersion: "resume.atsAudit@1.0.0" });
  });
});
