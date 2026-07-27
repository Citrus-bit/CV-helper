import { describe, expect, it } from "vitest";

import type { ResumeAST } from "@/lib/domain";
import type { ParsedPdfResult } from "@/lib/server/pdf";
import { analyzeParsedResume, resumeDocumentFromParsed } from "./analysis";

const ast: ResumeAST = {
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: {
    name: "候选人",
    email: "candidate@example.com",
    links: [],
  },
  sections: [
    {
      id: "experience",
      type: "experience",
      title: "工作经历",
      sourceBlockIds: ["heading", "low-confidence"],
      entries: [
        {
          id: "role-1",
          title: "产品经理",
          current: true,
          bullets: ["负责产品规划与跨团队交付"],
          keywords: ["产品规划"],
          sourceBlockIds: ["low-confidence"],
        },
      ],
    },
  ],
};

const parsed: ParsedPdfResult = {
  fileName: "ats-fixture.pdf",
  pageCount: 1,
  text: "候选人\ncandidate@example.com\n工作经历\n负责产品规划与跨团队交付",
  blocks: [
    {
      id: "name",
      pageIndex: 0,
      order: 0,
      text: "候选人",
      source: "pdf",
      confidence: 0.99,
      bbox: { x: 0.1, y: 0.05, width: 0.3, height: 0.04 },
    },
    {
      id: "email",
      pageIndex: 0,
      order: 1,
      text: "candidate@example.com",
      source: "pdf",
      confidence: 0.99,
      bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.03 },
    },
    {
      id: "heading",
      pageIndex: 0,
      order: 2,
      text: "工作经历",
      source: "pdf",
      confidence: 0.99,
      bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
    },
    {
      id: "low-confidence",
      pageIndex: 0,
      order: 3,
      text: "负责产品规划与跨团队交付",
      source: "ocr",
      confidence: 0.62,
      bbox: { x: 0.1, y: 0.27, width: 0.7, height: 0.05 },
    },
  ],
  pages: [
    {
      pageIndex: 0,
      width: 595,
      height: 842,
      previewWidth: 595,
      previewHeight: 842,
      source: "mixed",
      nativeCharacterCount: 40,
      previewDataUrl: "data:image/png;base64,cHJldmlldw==",
    },
  ],
  warnings: [],
  extractionMode: "hybrid",
};

describe("analyzeParsedResume ATS audit", () => {
  it("merges visual continuation lines into complete logical bullets", () => {
    const wrappedParsed: ParsedPdfResult = {
      ...structuredClone(parsed),
      text: [
        "候选人",
        "candidate@example.com",
        "项目经历",
        "知识库 2025-06 - 2025-08",
        "• 使用 Redis 缓存热",
        "点数据和会话上下",
        "文，提高系统响应速度。",
        "• 设计知识库管理模块。",
      ].join("\n"),
      extractionMode: "native",
      blocks: [
        ...parsed.blocks.slice(0, 2),
        {
          id: "projects-heading",
          pageIndex: 0,
          order: 2,
          text: "项目经历",
          source: "pdf",
          confidence: 0.99,
          bbox: { x: 0.1, y: 0.2, width: 0.2, height: 0.025 },
        },
        {
          id: "project-title",
          pageIndex: 0,
          order: 3,
          text: "知识库 2025-06 - 2025-08",
          source: "pdf",
          confidence: 0.99,
          bbox: { x: 0.1, y: 0.24, width: 0.5, height: 0.02 },
        },
        ...[
          "• 使用 Redis 缓存热",
          "点数据和会话上下",
          "文，提高系统响应速度。",
          "• 设计知识库管理模块。",
        ].map((text, index) => ({
          id: `project-line-${index}`,
          pageIndex: 0,
          order: 4 + index,
          text,
          source: "pdf" as const,
          confidence: 0.99,
          bbox: {
            x: index === 0 || index === 3 ? 0.1 : 0.12,
            y: 0.28 + index * 0.025,
            width: 0.65,
            height: 0.02,
          },
        })),
      ],
    };

    const resume = resumeDocumentFromParsed(wrappedParsed);

    expect(resume.ast.sections[0]?.entries[0]?.bullets).toEqual([
      "使用 Redis 缓存热点数据和会话上下文，提高系统响应速度。",
      "设计知识库管理模块。",
    ]);
  });

  it("keeps native typography on AST-linked source blocks", () => {
    const styledParsed = structuredClone(parsed);
    const heading = styledParsed.blocks.find((block) => block.id === "heading");
    if (!heading) throw new Error("Missing heading fixture");
    heading.role = "heading";
    heading.style = {
      fontFamily: "ABCDEE+Helvetica-Bold",
      fontSize: 14,
      fontWeight: 700,
      fontStyle: "normal",
    };

    const resume = resumeDocumentFromParsed(styledParsed);
    expect(resume.sourceBlocks.find((block) => block.id === "heading")).toMatchObject({
      role: "heading",
      style: heading.style,
    });
    expect(resume.ast.sections[0]?.sourceBlockIds).toContain("heading");
  });

  it("returns the canonical audit data and its capability source version", async () => {
    const analysis = await analyzeParsedResume(parsed, { ast });

    expect(analysis.atsAudit).toMatchObject({
      score: 90,
      passed: true,
      sourceVersion: "resume.atsAudit@1.0.0",
      findings: [
        {
          code: "LOW_CONFIDENCE_TEXT",
          severity: "warning",
          sourceBlockIds: ["low-confidence"],
        },
      ],
    });
    expect(analysis.processing.capabilityVersions["resume.atsAudit"]).toBe(
      analysis.atsAudit?.sourceVersion,
    );
    expect(analysis.processing.capabilityVersions["claim.assess"]).toBe(
      "claim.assess@1.0.0",
    );
    expect(analysis.claims).toEqual([
      expect.objectContaining({ status: "resume_only", confidence: 0.65 }),
    ]);
  });

  it("assesses conflicts without creating suggestions for untraceable AST text", async () => {
    const conflictAst: ResumeAST = {
      ...ast,
      locale: "en-US",
      sections: [
        {
          ...ast.sections[0],
          entries: [
            {
              ...ast.sections[0].entries[0],
              bullets: [
                "Improved platform latency by 20 percent using cache.",
                "Improved platform latency by 35 percent using cache.",
                "Built an industry-leading delivery platform.",
              ],
              keywords: ["platform", "latency"],
            },
          ],
        },
      ],
    };

    const analysis = await analyzeParsedResume(parsed, { ast: conflictAst });
    const conflictingClaims = analysis.claims.filter((claim) => claim.status === "conflicting");

    expect(conflictingClaims).toHaveLength(2);
    expect(conflictingClaims.every((claim) => claim.confidence === 0.65)).toBe(true);
    expect(analysis.claims.find((claim) => claim.text.includes("industry-leading"))).toMatchObject({
      status: "resume_only",
      confidence: 0.65,
    });
    const proofSuggestion = analysis.suggestions.find((suggestion) => suggestion.originalText.includes("industry-leading"));
    expect(proofSuggestion).toBeUndefined();
    expect(analysis.processing.capabilityVersions).toMatchObject({
      "claim.assess": "claim.assess@1.0.0",
      "claim.conflict": "claim.conflict@1.0.0",
    });
  });
});
