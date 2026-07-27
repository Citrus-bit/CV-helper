import { describe, expect, it } from "vitest";

import type { ResumeDocument } from "@/lib/domain";
import {
  mergeVisualResumeLines,
  normalizeBulletText,
  repairResumeAstLineBreaks,
  type VisualResumeLine,
} from "./resume-line-normalization";

function line(
  text: string,
  order: number,
  overrides: Partial<VisualResumeLine> = {},
): VisualResumeLine {
  return {
    text,
    blockIds: [`block-${order}`],
    pageIndex: 0,
    x: 0.12,
    y: 0.2 + order * 0.025,
    height: 0.02,
    ...overrides,
  };
}

describe("mergeVisualResumeLines", () => {
  it("merges wrapped Chinese lines without creating fragmented bullets", () => {
    const merged = mergeVisualResumeLines([
      line("• 使用 Redis 缓存热", 0),
      line("点数据和会话上下", 1, { x: 0.14 }),
      line("文，提高系统响应速度。", 2, { x: 0.14 }),
      line("• 设计知识库管理模块。", 3),
    ]);

    expect(merged.map((item) => item.text)).toEqual([
      "使用 Redis 缓存热点数据和会话上下文，提高系统响应速度。",
      "设计知识库管理模块。",
    ]);
    expect(merged[0]?.blockIds).toEqual(["block-0", "block-1", "block-2"]);
  });

  it("joins English continuations with spaces and keeps explicit bullets separate", () => {
    const merged = mergeVisualResumeLines([
      line("• Built a retrieval", 0),
      line("augmented generation service", 1, { x: 0.14 }),
      line("• Reduced latency by 30%.", 2),
    ]);

    expect(merged.map((item) => item.text)).toEqual([
      "Built a retrieval augmented generation service",
      "Reduced latency by 30%.",
    ]);
  });

  it("does not merge across pages or large vertical gaps", () => {
    const merged = mergeVisualResumeLines([
      line("• 第一条内容", 0),
      line("跨页内容", 1, { pageIndex: 1 }),
      line("独立段落", 2, { pageIndex: 1, y: 0.7 }),
    ]);

    expect(merged).toHaveLength(3);
  });

  it("collapses hard returns inside one manually edited bullet", () => {
    expect(normalizeBulletText("使用 Redis 缓存热\n点数据和会话上下\n文，提高速度。"))
      .toBe("使用 Redis 缓存热点数据和会话上下文，提高速度。");
  });
});

describe("repairResumeAstLineBreaks", () => {
  it("repairs an existing AST using original list-item evidence", () => {
    const resume = {
      ast: {
        schemaVersion: "1.0",
        locale: "zh-CN",
        contact: { name: "候选人", links: [] },
        sections: [
          {
            id: "projects",
            type: "projects",
            title: "项目经历",
            sourceBlockIds: ["start", "continuation-1", "continuation-2"],
            entries: [
              {
                id: "project-1",
                title: "知识库",
                current: false,
                bullets: ["使用 Redis 缓存热", "点数据和会话上下", "文，提高系统响应速度。"],
                keywords: [],
                sourceBlockIds: ["start", "continuation-1", "continuation-2"],
              },
            ],
          },
        ],
      },
      sourceBlocks: [
        {
          id: "start",
          pageIndex: 0,
          order: 0,
          text: "• 使用 Redis 缓存热",
          bbox: { x: 0.1, y: 0.2, width: 0.6, height: 0.02 },
          source: "native",
          confidence: 0.99,
          role: "list-item",
        },
        {
          id: "continuation-1",
          pageIndex: 0,
          order: 1,
          text: "点数据和会话上下",
          bbox: { x: 0.12, y: 0.23, width: 0.6, height: 0.02 },
          source: "native",
          confidence: 0.99,
          role: "paragraph",
        },
        {
          id: "continuation-2",
          pageIndex: 0,
          order: 2,
          text: "文，提高系统响应速度。",
          bbox: { x: 0.12, y: 0.26, width: 0.6, height: 0.02 },
          source: "native",
          confidence: 0.99,
          role: "paragraph",
        },
      ],
    } satisfies Pick<ResumeDocument, "ast" | "sourceBlocks">;

    const repaired = repairResumeAstLineBreaks(resume);

    expect(repaired.mergedCount).toBe(2);
    expect(repaired.ast.sections[0]?.entries[0]?.bullets).toEqual([
      "使用 Redis 缓存热点数据和会话上下文，提高系统响应速度。",
    ]);
  });
});
