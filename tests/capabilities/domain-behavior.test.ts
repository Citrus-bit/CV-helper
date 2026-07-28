import { describe, expect, it } from "vitest";

import { createDefaultCapabilityRegistry } from "@/lib/baseline";
import {
  ClaimSchema,
  EvidenceAssetSchema,
  InterviewQuestionSchema,
  JobPostingSchema,
  ResumeDocumentSchema,
} from "@/lib/domain";

const context = {
  sessionId: "session-domain-behavior",
  locale: "zh-CN" as const,
  traceId: "trace-domain-behavior",
  deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  grantedDataScopes: [
    "source_blocks",
    "resume_ast",
    "evidence_graph",
    "job_description",
    "anonymous_metadata",
    "interview_content",
  ] as const,
};

const question = InterviewQuestionSchema.parse({
  id: "question-analysis",
  locale: "zh-CN",
  prompt: "请说明一次你通过分析推动结果的经历。",
  category: "behavioral",
  difficulty: "intermediate",
  roleFamilies: ["product"],
  skills: ["分析", "协作"],
  followUps: ["你如何验证结果？"],
  scoringAnchors: ["个人行动具体", "结果可核实"],
  source: "domain-behavior-fixture-v1",
  generated: false,
  referenceQuestionIds: [],
});

const supportedEvidence = EvidenceAssetSchema.parse({
  id: "evidence-checkout",
  kind: "document",
  label: "转化率复盘记录",
  content: "Checkout conversion improved by 35%.",
  sourceBlockIds: ["block-checkout"],
  verifiedByUser: true,
  confidence: 0.9,
});

const supportedClaim = ClaimSchema.parse({
  id: "claim-checkout",
  text: "Improved checkout conversion by 35% through funnel analysis",
  action: "Improved checkout conversion",
  method: "through funnel analysis",
  result: "35%",
  sourceBlockIds: ["block-checkout"],
  evidenceAssetIds: [supportedEvidence.id],
  status: "supported",
  confidence: 0.9,
  missingInformation: [],
});

describe("deterministic domain capability behavior", () => {
  it("claim.conflict flags materially different metrics on the same claim", async () => {
    const conflictingClaim = ClaimSchema.parse({
      ...supportedClaim,
      id: "claim-checkout-conflict",
      text: "Improved checkout conversion by 20% through funnel analysis",
      result: "20%",
      evidenceAssetIds: [],
      status: "resume_only",
      confidence: 0.65,
    });

    const result = await createDefaultCapabilityRegistry().invoke<
      unknown,
      { conflicts: Array<{ claimIds: [string, string]; reason: string }> }
    >(
      "claim.conflict",
      { claims: [supportedClaim, conflictingClaim] },
      context,
    );

    expect(result.data.conflicts).toEqual([
      expect.objectContaining({
        claimIds: [supportedClaim.id, conflictingClaim.id],
        reason: expect.stringContaining("不同数值"),
      }),
    ]);
  });

  it("resume.atsAudit reports concrete machine-reading blockers", async () => {
    const resume = ResumeDocumentSchema.parse({
      id: "resume-ats-risk",
      revision: 0,
      originalFileName: "ats-risk.pdf",
      mimeType: "application/pdf",
      locale: "zh-CN",
      pageCount: 1,
      parseMethod: "mixed",
      sourceBlocks: [
        {
          id: "block-table",
          pageIndex: 0,
          order: 0,
          text: "技能表格",
          bbox: { x: 10, y: 10, width: 200, height: 30 },
          source: "ocr",
          confidence: 0.6,
          role: "table",
        },
      ],
      ast: {
        schemaVersion: "1.0",
        locale: "zh-CN",
        contact: { name: "候选人", links: [] },
        sections: [],
      },
      parsingWarnings: [],
    });

    const result = await createDefaultCapabilityRegistry().invoke<
      unknown,
      {
        score: number;
        passed: boolean;
        findings: Array<{ code: string; severity: string }>;
      }
    >("resume.atsAudit", { resume }, context);

    expect(result.data.passed).toBe(false);
    expect(result.data.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "CONTACT_MISSING",
        "TABLE_LAYOUT",
        "LOW_CONFIDENCE_TEXT",
        "NO_SECTIONS",
      ]),
    );
  });

  it("job.riskDetect identifies fee and discriminatory requirements", async () => {
    const jobPosting = JobPostingSchema.parse({
      id: "job-risk",
      title: "运营专员",
      locale: "zh-CN",
      rawText: "入职前先交培训费。本岗位年龄 28 岁以下，薪资面议。",
    });

    const result = await createDefaultCapabilityRegistry().invoke<
      unknown,
      { risks: Array<{ code: string; severity: string }> }
    >("job.riskDetect", { jobPosting }, context);

    expect(result.data.risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UPFRONT_FEE", severity: "high" }),
        expect.objectContaining({ code: "DISCRIMINATORY", severity: "high" }),
        expect.objectContaining({ code: "VAGUE_COMPENSATION" }),
      ]),
    );
  });

  it("copy.rewrite.zh and copy.rewrite.en preserve terms and numbers", async () => {
    const registry = createDefaultCapabilityRegistry();
    const zh = await registry.invoke<
      unknown,
      { original: string; rewritten: string; addedFacts: boolean }
    >(
      "copy.rewrite.zh",
      {
        text: "主要负责 TypeScript 平台，成功地将延迟降低 35%",
        preserveTerms: ["TypeScript", "35%"],
      },
      context,
    );
    const en = await registry.invoke<
      unknown,
      { original: string; rewritten: string; addedFacts: boolean }
    >(
      "copy.rewrite.en",
      {
        text: "Successfully was responsible for reducing latency by 35% in order to improve checkout.",
        preserveTerms: ["35%", "checkout"],
      },
      { ...context, locale: "en-US" },
    );

    expect(zh.data).toMatchObject({ addedFacts: false });
    expect(zh.data.rewritten).toContain("TypeScript");
    expect(zh.data.rewritten).toContain("35%");
    expect(zh.data.rewritten).not.toContain("主要负责");
    expect(en.data).toMatchObject({ addedFacts: false });
    expect(en.data.rewritten).toContain("35%");
    expect(en.data.rewritten).toContain("checkout");
    expect(en.data.rewritten).not.toMatch(/successfully|in order to/i);
  });

  it("copy.consistency returns a precise punctuation repair", async () => {
    const result = await createDefaultCapabilityRegistry().invoke<
      unknown,
      {
        consistent: boolean;
        issues: Array<{ index: number; code: string; suggestedText?: string }>;
      }
    >(
      "copy.consistency",
      {
        texts: ["完成需求分析。", "推动跨团队交付。", "建立质量监控"],
        locale: "zh-CN",
      },
      context,
    );

    expect(result.data.consistent).toBe(false);
    expect(result.data.issues).toEqual([
      expect.objectContaining({
        index: 2,
        code: "TERMINAL_PUNCTUATION",
        suggestedText: "建立质量监控。",
      }),
    ]);
  });

  it("question.retrieve ranks the requested skill from a controlled catalog", async () => {
    const otherQuestion = InterviewQuestionSchema.parse({
      ...question,
      id: "question-writing",
      prompt: "请说明一次写作经历。",
      skills: ["写作"],
    });

    const result = await createDefaultCapabilityRegistry().invoke<
      unknown,
      { questions: Array<{ id: string }> }
    >(
      "question.retrieve",
      {
        locale: "zh-CN",
        role: "product",
        skills: ["分析"],
        count: 1,
        catalog: [otherQuestion, question],
      },
      context,
    );

    expect(result.data.questions.map((item) => item.id)).toEqual([
      question.id,
    ]);
    expect(result.evidenceReferences).toEqual([question.id]);
  });

  it("interview.plan enforces the follow-up cap and reports shortages", async () => {
    const result = await createDefaultCapabilityRegistry().invoke<
      unknown,
      {
        maxFollowUpsPerQuestion: number;
        items: Array<{ order: number; targetMinutes: number }>;
      }
    >(
      "interview.plan",
      {
        locale: "zh-CN",
        questions: [question],
        durationMinutes: 20,
        questionCount: 2,
        maxFollowUpsPerQuestion: 2,
      },
      context,
    );

    expect(result.data.maxFollowUpsPerQuestion).toBe(2);
    expect(result.data.items).toEqual([
      expect.objectContaining({ order: 1, targetMinutes: 20 }),
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "QUESTION_SHORTAGE" }),
    ]);
  });

  it("story.build exposes missing facts instead of inventing a STAR result", async () => {
    const incompleteClaim = ClaimSchema.parse({
      id: "claim-incomplete",
      text: "通过用户访谈优化注册流程",
      action: "优化注册流程",
      method: "通过用户访谈",
      sourceBlockIds: ["block-incomplete"],
      evidenceAssetIds: [],
      status: "needs_evidence",
      confidence: 0.4,
      missingInformation: ["可核实的结果或影响"],
    });

    const result = await createDefaultCapabilityRegistry().invoke<
      unknown,
      { result: string; riskNotes: string[]; claimIds: string[] }
    >(
      "story.build",
      { claim: incompleteClaim, evidenceAssets: [] },
      context,
    );

    expect(result.data.result).toContain("待补充");
    expect(result.data.riskNotes.join(" ")).toContain("不要补造细节");
    expect(result.data.claimIds).toEqual([incompleteClaim.id]);
  });

  it("answer.evaluate and answer.coach cite the answer and preserve fact safety", async () => {
    const answer =
      "当时注册转化下降，我的目标是定位原因。我通过漏斗分析并与研发协作，最终将延迟降低 35%，复盘记录可以核对。";
    const registry = createDefaultCapabilityRegistry();
    const evaluation = await registry.invoke<
      unknown,
      {
        questionId: string;
        overallScore: number;
        dimensions: Record<string, number>;
        citedAnswerFragments: string[];
      }
    >(
      "answer.evaluate",
      { question, answer, expectedKeywords: ["分析", "协作"] },
      context,
    );
    const coaching = await registry.invoke<
      unknown,
      {
        actions: string[];
        improvedOutline: string[];
        factSafetyReminder: string;
      }
    >(
      "answer.coach",
      { question, answer, evaluation: evaluation.data },
      context,
    );

    expect(evaluation.data.questionId).toBe(question.id);
    expect(evaluation.data.overallScore).toBeGreaterThan(0);
    expect(evaluation.data.citedAnswerFragments.join(" ")).toContain("35%");
    expect(coaching.data.actions).toHaveLength(2);
    expect(coaching.data.improvedOutline).toHaveLength(5);
    expect(coaching.data.factSafetyReminder).toContain("不补造数字");
  });

  it("resumeInterview.check warns about new metrics and weak source claims", async () => {
    const weakClaim = ClaimSchema.parse({
      ...supportedClaim,
      status: "needs_evidence",
      confidence: 0.4,
    });
    const result = await createDefaultCapabilityRegistry().invoke<
      unknown,
      { consistent: boolean; findings: Array<{ explanation: string }> }
    >(
      "resumeInterview.check",
      {
        answer:
          "I improved checkout conversion by 50% through funnel analysis.",
        claims: [weakClaim],
      },
      context,
    );

    expect(result.data.consistent).toBe(false);
    expect(result.data.findings.map((finding) => finding.explanation)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("简历中没有的数值"),
        expect.stringContaining("声明本身仍待核对"),
      ]),
    );
  });
});
