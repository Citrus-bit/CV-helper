// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AtsAuditSchema,
  ScorecardSchema,
  SourceBlockSchema,
} from "@/lib/domain";
import { ScorePanel } from "./score-panel";

const scorecard = ScorecardSchema.parse({
  resumeId: "resume-1",
  resumeRevision: 0,
  total: 82,
  summary: "优先补强成果证据。",
  dimensions: [
    ["impact", "成果与影响力", 15, 25],
    ["completeness", "信息完整性", 14, 15],
    ["clarity", "清晰与精炼", 13, 15],
    ["structure", "结构与版式", 14, 15],
    ["ats", "ATS 可解析性", 13, 15],
    ["language", "语言规范性", 13, 15],
  ].map(([id, label, score, maxScore], index) => ({
    id,
    label,
    score,
    maxScore,
    evidence: index === 0 ? ["项目交付周期缩短 20%"] : [],
    deductions: index === 0 ? ["缺少影响范围", "结果缺少外部佐证"] : [],
  })),
});

const atsAudit = AtsAuditSchema.parse({
  score: 63,
  passed: false,
  sourceVersion: "resume.atsAudit@1.0.0",
  findings: [
    {
      code: "READING_ORDER",
      severity: "info",
      message: "建议核对机器阅读顺序。",
      sourceBlockIds: [],
    },
    {
      code: "LOW_CONFIDENCE_TEXT",
      severity: "warning",
      message: "部分文本解析置信度较低。",
      sourceBlockIds: ["block-page-1"],
    },
    {
      code: "CONTACT_MISSING",
      severity: "error",
      message: "缺少可识别的邮箱或电话。",
      sourceBlockIds: ["block-page-2"],
    },
  ],
});

const sourceBlocks = [
  SourceBlockSchema.parse({
    id: "block-page-1",
    pageIndex: 0,
    order: 0,
    text: "负责产品规划与跨团队交付",
    bbox: { x: 0.1, y: 0.2, width: 0.7, height: 0.05 },
    source: "ocr",
    confidence: 0.62,
    role: "list-item",
  }),
  SourceBlockSchema.parse({
    id: "block-page-2",
    pageIndex: 1,
    order: 0,
    text: "个人信息区域",
    bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.05 },
    source: "native",
    confidence: 0.99,
    role: "contact",
  }),
];

afterEach(cleanup);

describe("ScorePanel", () => {
  it("shows every deduction and available evidence without growing unbounded", () => {
    render(createElement(ScorePanel, { scorecard }));
    fireEvent.click(screen.getByRole("button", { name: /诊断/ }));

    expect(screen.getByText("扣分：缺少影响范围")).toBeInTheDocument();
    expect(screen.getByText("扣分：结果缺少外部佐证")).toBeInTheDocument();
    expect(screen.getByText("依据：项目交付周期缩短 20%")).toBeInTheDocument();
    expect(
      screen.getByLabelText("成果与影响力评分依据").parentElement,
    ).toHaveClass("space-y-3");
    expect(screen.getByText("优先补强成果证据。").parentElement).toHaveClass(
      "max-h-72",
      "overflow-y-auto",
    );
  });

  it("shows ATS status, every localized severity, and linked source excerpts", () => {
    render(createElement(ScorePanel, { scorecard, atsAudit, sourceBlocks }));

    expect(screen.getByText("ATS 63 分 · 需处理")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /诊断/ }));

    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === "P" &&
          node.textContent === "提示：建议核对机器阅读顺序。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === "P" &&
          node.textContent === "需关注：部分文本解析置信度较低。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === "P" &&
          node.textContent === "阻断：缺少可识别的邮箱或电话。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("来源第 1 页：负责产品规划与跨团队交付"),
    ).toBeInTheDocument();
    expect(screen.getByText("来源第 2 页：个人信息区域")).toBeInTheDocument();
  });

  it("keeps older analyses without ATS data readable", () => {
    render(createElement(ScorePanel, { scorecard }));

    expect(
      screen.getByText("旧记录暂无 ATS 审计"),
    ).toBeInTheDocument();
  });
});
