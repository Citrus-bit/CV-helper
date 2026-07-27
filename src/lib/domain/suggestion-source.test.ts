import { describe, expect, it } from "vitest";

import { ResumeDocumentSchema } from "./schemas";
import {
  resolveResumeTextSourceBlocks,
  resolveResumeTextTarget,
} from "./suggestion-source";

const path = "/sections/0/entries/0/bullets/0";

function resumeWithBlocks(
  blocks: Array<{ id: string; text: string; pageIndex?: number; order: number }>,
  bullet = "负责平台建设并推动版本上线",
) {
  return ResumeDocumentSchema.parse({
    id: "resume-1",
    revision: 0,
    originalFileName: "resume.pdf",
    mimeType: "application/pdf",
    locale: "zh-CN",
    pageCount: 2,
    parseMethod: "native",
    sourceBlocks: blocks.map((block) => ({
      ...block,
      pageIndex: block.pageIndex ?? 0,
      bbox: { x: 0.1, y: 0.1 + block.order * 0.05, width: 0.7, height: 0.04 },
      source: "native",
      confidence: 1,
      role: "list-item",
    })),
    ast: {
      schemaVersion: "1.0",
      locale: "zh-CN",
      contact: { name: "候选人", links: [] },
      sections: [
        {
          id: "experience",
          type: "experience",
          title: "工作经历",
          sourceBlockIds: blocks.map((block) => block.id),
          entries: [
            {
              id: "entry-1",
              title: "工程师",
              current: true,
              bullets: [bullet],
              keywords: [],
              sourceBlockIds: blocks.map((block) => block.id),
            },
          ],
        },
      ],
    },
    parsingWarnings: [],
  });
}

describe("resume suggestion source resolution", () => {
  it("resolves the target text and its entry source scope", () => {
    const resume = resumeWithBlocks([
      { id: "bullet", text: "负责平台建设并推动版本上线", order: 0 },
    ]);

    expect(resolveResumeTextTarget(resume, path)).toEqual({
      text: "负责平台建设并推动版本上线",
      sourceBlockIds: ["bullet"],
    });
  });

  it("uses the unique exact block instead of an unrelated entry heading", () => {
    const resume = resumeWithBlocks([
      { id: "heading", text: "高级工程师", order: 0 },
      { id: "bullet", text: "负责平台建设并推动版本上线。", order: 1 },
    ]);

    expect(
      resolveResumeTextSourceBlocks(
        resume,
        path,
        "负责平台建设并推动版本上线",
      ).map((block) => block.id),
    ).toEqual(["bullet"]);
  });

  it("keeps an ordered same-page sequence that fully covers wrapped text", () => {
    const resume = resumeWithBlocks([
      { id: "label", text: "项目描述", order: 0 },
      { id: "line-1", text: "负责平台建设", order: 1 },
      { id: "line-2", text: "并推动版本上线", order: 2 },
    ]);

    expect(
      resolveResumeTextSourceBlocks(
        resume,
        path,
        "负责平台建设并推动版本上线",
      ).map((block) => block.id),
    ).toEqual(["line-1", "line-2"]);
  });

  it("rejects duplicate, cross-page, and partial matches instead of guessing", () => {
    const duplicate = resumeWithBlocks([
      { id: "first", text: "负责平台建设并推动版本上线", order: 0 },
      { id: "second", text: "负责平台建设并推动版本上线", order: 1 },
    ]);
    const crossPage = resumeWithBlocks([
      { id: "line-1", text: "负责平台建设", pageIndex: 0, order: 0 },
      { id: "line-2", text: "并推动版本上线", pageIndex: 1, order: 1 },
    ]);
    const partial = resumeWithBlocks([
      { id: "partial", text: "负责平台建设", order: 0 },
    ]);

    expect(resolveResumeTextSourceBlocks(duplicate, path, duplicate.ast.sections[0].entries[0].bullets[0])).toEqual([]);
    expect(resolveResumeTextSourceBlocks(crossPage, path, crossPage.ast.sections[0].entries[0].bullets[0])).toEqual([]);
    expect(resolveResumeTextSourceBlocks(partial, path, partial.ast.sections[0].entries[0].bullets[0])).toEqual([]);
  });
});
