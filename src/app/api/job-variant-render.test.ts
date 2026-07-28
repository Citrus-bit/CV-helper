import { describe, expect, it } from "vitest";

import { POST as renderResume } from "@/app/api/render/route";
import { RenderResponseSchema } from "@/lib/client/contracts";
import {
  ClaimSchema,
  JDRequirementSchema,
  RequirementEvidenceMapSchema,
  ResumeASTSchema,
} from "@/lib/domain";
import { buildJobVariant } from "@/lib/server/job-variant";

const baseAst = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: {
    name: "候选人",
    headline: "求职意向：后端开发实习生",
    location: "深圳",
    links: [],
  },
  sections: [
    {
      id: "projects",
      type: "projects",
      title: "项目经历",
      entries: [
        {
          id: "project-entry",
          title: "智能分析平台",
          current: false,
          bullets: [
            "负责跨团队需求沟通与项目排期",
            "使用 Python 完成模型训练与数据分析",
          ],
          keywords: ["Python", "模型训练", "数据分析"],
          sourceBlockIds: ["project-block"],
        },
      ],
      sourceBlockIds: ["project-block"],
    },
  ],
});

const requirement = JDRequirementSchema.parse({
  id: "requirement-ml",
  jobPostingId: "job-algorithm",
  category: "must_have",
  text: "熟悉 Python、模型训练和数据分析",
  keywords: ["Python", "模型训练", "数据分析"],
  importance: 1,
});

const claim = ClaimSchema.parse({
  id: "claim-ml",
  text: "使用 Python 完成模型训练与数据分析",
  sourceBlockIds: ["project-block"],
  evidenceAssetIds: ["evidence-project"],
  status: "supported",
  confidence: 0.95,
  missingInformation: [],
});

const mapping = RequirementEvidenceMapSchema.parse({
  requirementId: requirement.id,
  status: "met",
  claimIds: [claim.id],
  evidenceAssetIds: ["evidence-project"],
  explanation: "项目中有可追溯的算法相关证据。",
  confidence: 0.95,
});

async function render(resumeId: string, ast: typeof baseAst) {
  const response = await renderResume(
    new Request("http://localhost/api/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resumeId,
        revision: 0,
        ast,
        template: "professional",
        sourcePageCount: 1,
      }),
    }),
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return RenderResponseSchema.parse(await response.json());
}

describe("job variant PDF rendering", () => {
  it("renders a visibly distinct, content-complete PDF for the target role", async () => {
    const variant = buildJobVariant({
      ast: baseAst,
      targetTitle: "算法工程师",
      requirements: [requirement],
      mappings: [mapping],
      claims: [claim],
    });

    expect(variant).not.toBeNull();
    expect(variant!.ast.contact.headline).toBe("求职意向：算法工程师");
    expect(variant!.ast.sections[0].entries[0].bullets[0]).toBe(
      "使用 Python 完成模型训练与数据分析",
    );

    const baseRender = await render("resume-base", baseAst);
    const variantRender = await render("resume-algorithm-variant", variant!.ast);

    expect(baseRender.sha256).not.toBe(variantRender.sha256);
    expect(variantRender.astContentCovered).toBe(true);
    expect(variantRender.report).toMatchObject({
      resumeId: "resume-algorithm-variant",
      resumeRevision: 0,
      template: "professional",
    });
    expect(Buffer.from(variantRender.pdfBase64, "base64").subarray(0, 5).toString("ascii")).toBe(
      "%PDF-",
    );
  });
});
