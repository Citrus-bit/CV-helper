import { describe, expect, it } from "vitest";

import {
  ClaimSchema,
  JDRequirementSchema,
  RequirementEvidenceMapSchema,
  ResumeASTSchema,
} from "@/lib/domain";
import { buildJobVariant } from "./job-variant";

const ast = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: { name: "候选人", links: [] },
  summary: "产品经理",
  sections: [
    {
      id: "summary",
      type: "summary",
      title: "个人简介",
      text: "产品经理",
      entries: [],
      sourceBlockIds: [],
    },
    {
      id: "education",
      type: "education",
      title: "教育背景",
      entries: [
        {
          id: "degree",
          title: "管理学硕士",
          current: false,
          bullets: [],
          keywords: [],
          sourceBlockIds: ["education-block"],
        },
      ],
      sourceBlockIds: ["education-block"],
    },
    {
      id: "experience",
      type: "experience",
      title: "工作经历",
      entries: [
        {
          id: "general-role",
          title: "产品经理",
          current: false,
          bullets: ["负责产品规划与跨团队协作"],
          keywords: ["产品规划"],
          sourceBlockIds: ["general-block"],
        },
        {
          id: "sql-role",
          title: "数据产品经理",
          current: true,
          bullets: ["使用 SQL 完成漏斗分析"],
          keywords: ["SQL", "漏斗分析"],
          sourceBlockIds: ["sql-block"],
        },
      ],
      sourceBlockIds: ["general-block", "sql-block"],
    },
    {
      id: "skills",
      type: "skills",
      title: "核心技能",
      entries: [
        {
          id: "skills-entry",
          title: "数据分析",
          current: false,
          bullets: ["SQL、A/B 测试"],
          keywords: ["SQL", "A/B 测试"],
          sourceBlockIds: ["skills-block"],
        },
      ],
      sourceBlockIds: ["skills-block"],
    },
  ],
});

const requirement = JDRequirementSchema.parse({
  id: "requirement-sql",
  jobPostingId: "job-1",
  category: "must_have",
  text: "熟练使用 SQL 进行数据分析",
  keywords: ["SQL", "数据分析"],
  importance: 1,
});

const claim = ClaimSchema.parse({
  id: "claim-sql",
  text: "使用 SQL 完成漏斗分析",
  sourceBlockIds: ["sql-block"],
  evidenceAssetIds: ["evidence-sql"],
  status: "supported",
  confidence: 0.9,
  missingInformation: [],
});

const mapping = RequirementEvidenceMapSchema.parse({
  requirementId: requirement.id,
  status: "met",
  claimIds: [claim.id],
  evidenceAssetIds: ["evidence-sql"],
  explanation: "SQL 经历有简历证据。",
  confidence: 0.9,
});

function primitiveInventory(value: unknown): string[] {
  if (value === null || typeof value !== "object") {
    return [`${typeof value}:${String(value)}`];
  }
  if (Array.isArray(value)) return value.flatMap(primitiveInventory).sort();
  return Object.entries(value)
    .flatMap(([key, child]) => [`key:${key}`, ...primitiveInventory(child)])
    .sort();
}

describe("buildJobVariant", () => {
  it("creates an auditable variant by reordering existing content only", () => {
    const result = buildJobVariant({
      ast,
      requirements: [requirement],
      mappings: [mapping],
      claims: [claim],
    });

    expect(result).not.toBeNull();
    expect(result!.ast.sections.map((section) => section.id)).toEqual([
      "summary",
      "experience",
      "skills",
      "education",
    ]);
    expect(
      result!.ast.sections
        .find((section) => section.id === "experience")
        ?.entries.map((entry) => entry.id),
    ).toEqual(["sql-role", "general-role"]);
    expect(result!.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "section_reorder",
          requirementIds: [requirement.id],
          claimIds: [claim.id],
        }),
        expect.objectContaining({
          kind: "entry_reorder",
          path: "/sections/by-id/experience/entries",
          requirementIds: [requirement.id],
          claimIds: [claim.id],
        }),
      ]),
    );
    expect(primitiveInventory(result!.ast)).toEqual(primitiveInventory(ast));
    expect(result!.ast).not.toEqual(ast);
  });

  it("visibly tailors a single-entry resume by updating the target role and bullet priority", () => {
    const singleEntryAst = ResumeASTSchema.parse({
      ...ast,
      contact: {
        ...ast.contact,
        headline: "求职意向：后端开发实习生",
      },
      sections: [
        {
          id: "projects",
          type: "projects",
          title: "项目经历",
          entries: [
            {
              id: "project-entry",
              title: "业务分析平台",
              current: false,
              bullets: [
                "负责跨团队需求沟通与项目排期",
                "使用 SQL 完成漏斗分析",
              ],
              keywords: ["SQL", "漏斗分析"],
              sourceBlockIds: ["sql-block"],
            },
          ],
          sourceBlockIds: ["sql-block"],
        },
      ],
    });

    const result = buildJobVariant({
      ast: singleEntryAst,
      targetTitle: "数据产品经理",
      requirements: [requirement],
      mappings: [mapping],
      claims: [claim],
    });

    expect(result).not.toBeNull();
    expect(result!.ast.contact.headline).toBe("求职意向：数据产品经理");
    expect(result!.ast.sections[0].entries[0].bullets).toEqual([
      "使用 SQL 完成漏斗分析",
      "负责跨团队需求沟通与项目排期",
    ]);
    expect(result!.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "headline_update",
          path: "/contact/headline",
          beforeText: "求职意向：后端开发实习生",
          afterText: "求职意向：数据产品经理",
        }),
        expect.objectContaining({
          kind: "bullet_reorder",
          path: "/sections/by-id/projects/entries/by-id/project-entry/bullets",
          requirementIds: [requirement.id],
          claimIds: [claim.id],
        }),
      ]),
    );
    expect([...result!.ast.sections[0].entries[0].bullets].sort()).toEqual(
      [...singleEntryAst.sections[0].entries[0].bullets].sort(),
    );
  });

  it("creates a target-role variant even when existing content is already ordered", () => {
    const result = buildJobVariant({
      ast,
      targetTitle: "资深产品负责人",
      requirements: [],
      mappings: [],
      claims: [],
    });

    expect(result?.ast.contact.headline).toBe("资深产品负责人");
    expect(result?.changes).toEqual([
      expect.objectContaining({
        kind: "headline_update",
        requirementIds: [],
        claimIds: [],
      }),
    ]);
  });

  it("does not claim a variant when no safe order change exists", () => {
    const singleSection = ResumeASTSchema.parse({
      ...ast,
      sections: [ast.sections[0]],
    });

    expect(
      buildJobVariant({
        ast: singleSection,
        requirements: [requirement],
        mappings: [mapping],
        claims: [claim],
      }),
    ).toBeNull();
  });

  it("does not use gaps or conflicting claims to promote content", () => {
    expect(
      buildJobVariant({
        ast,
        requirements: [requirement],
        mappings: [{ ...mapping, status: "gap", claimIds: [] }],
        claims: [{ ...claim, status: "conflicting" }],
      }),
    ).toBeNull();
  });
});
