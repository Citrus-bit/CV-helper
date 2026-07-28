import { describe, expect, it } from "vitest";

import {
  resumeTextSafetyError,
  unsupportedResumeCharacters,
} from "./resume-text-safety";

describe("resume export text safety", () => {
  it("allows ordinary resume punctuation and bullet symbols", () => {
    expect(
      resumeTextSafetyError("负责 C++ / TypeScript 平台交付，周期缩短 20% • 已上线。"),
    ).toBeNull();
  });

  it("identifies placeholder, invisible, private-use, and emoji characters", () => {
    const issues = unsupportedResumeCharacters(
      `占位□替代\uFFFD零宽\u200B私用\uE000表情\u{1F680}`,
    );

    expect(issues.map((issue) => issue.label)).toEqual([
      "占位方框",
      "无效替代字符",
      "不可见格式字符",
      "私用字形",
      "表情或图标字符",
    ]);
    expect(resumeTextSafetyError("正常文字□")).toContain("U+25A1");
    expect(resumeTextSafetyError("无效\uD800")).toContain("U+D800");
  });
});
