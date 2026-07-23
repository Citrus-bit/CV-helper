import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";

import { InterviewQuestionSchema } from "@/lib/domain";
import {
  loadInterviewQuestionCatalog,
  selectInterviewQuestions,
} from "@/lib/server/interview-knowledge";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("interview knowledge loader", () => {
  it("loads exactly 60 unique, schema-valid questions", async () => {
    const questions = await loadInterviewQuestionCatalog("zh-CN", {
      cache: false,
    });

    expect(questions).toHaveLength(60);
    expect(new Set(questions.map((question) => question.id)).size).toBe(60);
    for (const question of questions) {
      expect(InterviewQuestionSchema.safeParse(question).success).toBe(true);
    }
  });

  it("extracts Chinese and English prompts from the same content unit", async () => {
    const [chineseCatalog, englishCatalog] = await Promise.all([
      loadInterviewQuestionCatalog("zh-CN", { cache: false }),
      loadInterviewQuestionCatalog("en-US", { cache: false }),
    ]);
    const chinese = chineseCatalog.find((question) => question.id === "sd-001");
    const english = englishCatalog.find((question) => question.id === "sd-001");

    expect(chinese?.prompt).toContain("生产事故");
    expect(chinese?.prompt).not.toContain("Describe a production incident");
    expect(english?.prompt).toContain("Describe a production incident");
    expect(english?.prompt).not.toContain("生产事故");
    expect(chinese?.followUps[0]).toContain("指标");
    expect(english?.followUps[0]).toContain("signal");
  });

  it("rejects a manifest path that escapes the questions directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "interview-knowledge-"));
    temporaryRoots.push(root);
    const manifest = {
      schema_version: "1.0.0",
      package: {
        id: "test-pack",
        version: "1.0.0",
        title: "Test",
        locales: ["zh-CN", "en"],
        source: "test-editorial",
        license: "LicenseRef-Test",
        total_questions: 1,
        reviewed_at: "2026-07-22",
      },
      governance: {
        execution_policy: "content-only",
        minimum_status: "editorial-review",
        generated_followups_must_reference_source_ids: true,
        max_followups_per_main_question: 2,
        prohibited_assessments: ["accent"],
      },
      distribution: {
        general_behavior: 1,
        software_data: 0,
        product_operations: 0,
        marketing_sales: 0,
        finance_accounting: 0,
        manufacturing_supply_chain: 0,
      },
      questions: [{ id: "beh-001", path: "questions/../../outside.md" }],
    };
    await writeFile(
      path.join(root, "manifest.yaml"),
      YAML.stringify(manifest),
      "utf8",
    );

    await expect(
      loadInterviewQuestionCatalog("zh-CN", {
        interviewRoot: root,
        cache: false,
      }),
    ).rejects.toThrow(/questions|路径穿越/);
  });

  it("ranks the same locale, role and skills query deterministically", async () => {
    const catalog = await loadInterviewQuestionCatalog("en-US", {
      cache: false,
    });
    const selection = {
      locale: "en-US" as const,
      role: "engineering",
      skills: ["incident-response", "reliability"],
      limit: 6,
    };

    const first = selectInterviewQuestions(catalog, selection).map(
      (question) => question.id,
    );
    const second = selectInterviewQuestions(
      [...catalog].reverse(),
      selection,
    ).map((question) => question.id);

    expect(first).toEqual(second);
    expect(first[0]).toBe("sd-001");
    expect(
      selectInterviewQuestions(catalog, { locale: "zh-CN", limit: 6 }),
    ).toEqual([]);
  });
});
