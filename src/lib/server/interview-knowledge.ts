import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import YAML from "yaml";
import { z } from "zod";

import {
  InterviewQuestionSchema,
  LocaleSchema,
  type InterviewQuestion,
  type Locale,
} from "@/lib/domain";

const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, "必须使用语义化版本号。");
const IsoDateSchema = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
    "必须使用有效的 ISO 日期。",
  );
const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "必须使用小写 kebab-case 标识。");
const QuestionIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*-\d{3}$/, "题目 ID 格式无效。");
const ManifestLocaleSchema = z.enum(["zh-CN", "en"]);
const IndustrySchema = z.enum([
  "cross-industry",
  "software-data",
  "product-operations",
  "marketing-sales",
  "finance-accounting",
  "manufacturing-supply-chain",
]);
const DifficultySchema = z.enum(["easy", "medium", "hard"]);
const QuestionTypeSchema = z.enum([
  "behavioral",
  "situational",
  "technical",
  "technical-behavioral",
  "technical-case",
  "case",
  "system-design",
  "role-play",
]);

const ManifestQuestionPathSchema = z.string().superRefine((value, context) => {
  const segments = value.split("/");
  const valid =
    !path.isAbsolute(value) &&
    !value.includes("\\") &&
    segments.length >= 2 &&
    segments[0] === "questions" &&
    segments.every(
      (segment) => segment !== "" && segment !== "." && segment !== "..",
    ) &&
    value.endsWith(".md");
  if (!valid) {
    context.addIssue({
      code: "custom",
      message: "题目路径必须位于 questions 目录，且不能包含路径穿越片段。",
    });
  }
});

const ManifestQuestionSchema = z
  .object({
    id: QuestionIdSchema,
    path: ManifestQuestionPathSchema,
  })
  .strict();

const ManifestSchema = z
  .object({
    schema_version: SemverSchema,
    package: z
      .object({
        id: SlugSchema,
        version: SemverSchema,
        title: z.string().trim().min(1),
        locales: z.array(ManifestLocaleSchema).length(2),
        source: z.string().trim().min(1),
        license: z.string().trim().min(1),
        total_questions: z.number().int().positive(),
        reviewed_at: IsoDateSchema,
      })
      .strict(),
    governance: z
      .object({
        execution_policy: z.literal("content-only"),
        minimum_status: z.enum(["editorial-review", "approved"]),
        generated_followups_must_reference_source_ids: z.boolean(),
        max_followups_per_main_question: z.number().int().min(0).max(2),
        prohibited_assessments: z.array(
          z.enum([
            "accent",
            "gender",
            "voice_timbre",
            "emotion",
            "personality",
          ]),
        ),
      })
      .strict(),
    distribution: z
      .object({
        general_behavior: z.number().int().nonnegative(),
        software_data: z.number().int().nonnegative(),
        product_operations: z.number().int().nonnegative(),
        marketing_sales: z.number().int().nonnegative(),
        finance_accounting: z.number().int().nonnegative(),
        manufacturing_supply_chain: z.number().int().nonnegative(),
      })
      .strict(),
    questions: z.array(ManifestQuestionSchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const [index, question] of manifest.questions.entries()) {
      if (ids.has(question.id)) {
        context.addIssue({
          code: "custom",
          path: ["questions", index, "id"],
          message: `题目 ID 重复: ${question.id}`,
        });
      }
      if (paths.has(question.path)) {
        context.addIssue({
          code: "custom",
          path: ["questions", index, "path"],
          message: `题目路径重复: ${question.path}`,
        });
      }
      ids.add(question.id);
      paths.add(question.path);
    }

    if (manifest.questions.length !== manifest.package.total_questions) {
      context.addIssue({
        code: "custom",
        path: ["package", "total_questions"],
        message: `题库声明 ${manifest.package.total_questions} 题，但 manifest 引用了 ${manifest.questions.length} 题。`,
      });
    }

    const distributionTotal = Object.values(manifest.distribution).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (distributionTotal !== manifest.package.total_questions) {
      context.addIssue({
        code: "custom",
        path: ["distribution"],
        message: `领域配额合计 ${distributionTotal} 与题库总数 ${manifest.package.total_questions} 不一致。`,
      });
    }

    if (new Set(manifest.package.locales).size !== 2) {
      context.addIssue({
        code: "custom",
        path: ["package", "locales"],
        message: "题库必须声明唯一的中文和英文 locale。",
      });
    }
  });

const FrontmatterSchema = z
  .object({
    id: QuestionIdSchema,
    industry: IndustrySchema,
    role_family: SlugSchema,
    levels: z.array(z.enum(["entry", "mid", "senior", "executive"])).min(1),
    difficulty: DifficultySchema,
    type: QuestionTypeSchema,
    skills: z.array(SlugSchema).min(1),
    source: z.string().trim().min(1),
    license: z.string().trim().min(1),
    status: z.enum(["editorial-review", "approved"]),
    version: SemverSchema,
    reviewed_at: IsoDateSchema,
  })
  .strict()
  .superRefine((attributes, context) => {
    if (new Set(attributes.levels).size !== attributes.levels.length) {
      context.addIssue({
        code: "custom",
        path: ["levels"],
        message: "levels 不能重复。",
      });
    }
    if (new Set(attributes.skills).size !== attributes.skills.length) {
      context.addIssue({
        code: "custom",
        path: ["skills"],
        message: "skills 不能重复。",
      });
    }
  });

const SelectionSchema = z.object({
  locale: LocaleSchema,
  role: z.string().trim().max(200).optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  limit: z.number().int().min(1).max(20).default(6),
});

export type InterviewQuestionSelection = z.input<typeof SelectionSchema>;

export interface InterviewKnowledgeLoadOptions {
  /** Trusted package root override for fixtures and offline validation. */
  interviewRoot?: string;
  cache?: boolean;
}

type Manifest = z.infer<typeof ManifestSchema>;
type Frontmatter = z.infer<typeof FrontmatterSchema>;
type LocalizedPair = { zh: string; en: string };

function parseYaml(source: string): object {
  const parsed: unknown = YAML.parse(source, { schema: "core", strict: true });
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("YAML 根节点必须是对象。");
  }
  return parsed;
}

function parseQuestionDocument(markdown: string): {
  attributes: Frontmatter;
  body: string;
} {
  const parsed = matter(markdown, {
    language: "yaml",
    engines: { yaml: parseYaml },
  });
  return {
    attributes: FrontmatterSchema.parse(parsed.data),
    body: parsed.content,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownSection(body: string, title: string) {
  const heading = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*$`, "m").exec(
    body,
  );
  if (!heading) return "";
  const contentStart = heading.index + heading[0].length;
  const remainder = body.slice(contentStart).replace(/^\r?\n/, "");
  const nextHeading = /^##\s+/m.exec(remainder);
  return remainder.slice(0, nextHeading?.index).trim();
}

function plainText(value: string) {
  return value
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function bilingualPair(value: string, field: string): LocalizedPair {
  const text = plainText(value);
  const chineseMarker = /(?:^|\n)\s*中文[：:]\s*/i.exec(text);
  const englishMarker = /(?:^|\n|\s+\/\s+)\s*English[：:]\s*/i.exec(text);

  if (
    chineseMarker &&
    englishMarker &&
    englishMarker.index > chineseMarker.index
  ) {
    const chineseStart = chineseMarker.index + chineseMarker[0].length;
    const chinese = text
      .slice(chineseStart, englishMarker.index)
      .replace(/\s*\/\s*$/, "")
      .trim();
    const english = text
      .slice(englishMarker.index + englishMarker[0].length)
      .trim();
    if (chinese && english) return { zh: chinese, en: english };
  }

  const separator = /\s+\/\s+/.exec(text);
  if (separator) {
    const chinese = text
      .slice(0, separator.index)
      .replace(/^中文[：:]\s*/i, "")
      .trim();
    const english = text
      .slice(separator.index + separator[0].length)
      .replace(/^English[：:]\s*/i, "")
      .trim();
    if (chinese && english) return { zh: chinese, en: english };
  }

  throw new Error(`${field} 必须同时包含中文和英文内容。`);
}

function localized(pair: LocalizedPair, locale: Locale) {
  if (locale === "en-US") return pair.en;
  if (locale === "mixed") return `${pair.zh}\n${pair.en}`;
  return pair.zh;
}

function localizedBulletLines(section: string, locale: Locale, field: string) {
  return section
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map((line, index) =>
      localized(
        bilingualPair(
          line.replace(/^\s*[-*]\s+/, ""),
          `${field} 第 ${index + 1} 项`,
        ),
        locale,
      ),
    );
}

const difficultyMap: Record<
  z.infer<typeof DifficultySchema>,
  InterviewQuestion["difficulty"]
> = {
  easy: "introductory",
  medium: "intermediate",
  hard: "advanced",
};

const categoryMap: Record<
  z.infer<typeof QuestionTypeSchema>,
  InterviewQuestion["category"]
> = {
  behavioral: "behavioral",
  situational: "role",
  technical: "technical",
  "technical-behavioral": "technical",
  "technical-case": "case",
  case: "case",
  "system-design": "technical",
  "role-play": "role",
};

function questionFromMarkdown(
  markdown: string,
  locale: Locale,
  manifest: Manifest,
) {
  const { attributes, body } = parseQuestionDocument(markdown);
  const prompt = localized(
    bilingualPair(markdownSection(body, "问题 / Question"), "问题"),
    locale,
  );
  const followUps = localizedBulletLines(
    markdownSection(body, "追问 / Follow-ups"),
    locale,
    "追问",
  );
  const strongSignals = localizedBulletLines(
    markdownSection(body, "优秀信号 / Strong signals"),
    locale,
    "优秀信号",
  );
  const anchors = localizedBulletLines(
    markdownSection(body, "评分锚点 / Scoring anchors"),
    locale,
    "评分锚点",
  );

  if (followUps.length < 2)
    throw new Error(`题目 ${attributes.id} 至少需要 2 个双语追问。`);
  if (strongSignals.length < 3)
    throw new Error(`题目 ${attributes.id} 至少需要 3 个双语优秀信号。`);
  if (anchors.length < 3)
    throw new Error(`题目 ${attributes.id} 至少需要 3 个双语评分锚点。`);

  return {
    attributes,
    question: InterviewQuestionSchema.parse({
      id: attributes.id,
      locale,
      prompt,
      category: categoryMap[attributes.type],
      difficulty: difficultyMap[attributes.difficulty],
      roleFamilies: [attributes.role_family, attributes.industry],
      skills: attributes.skills,
      followUps: followUps.slice(
        0,
        manifest.governance.max_followups_per_main_question,
      ),
      scoringAnchors: [...strongSignals, ...anchors],
      source: `${attributes.source}/${attributes.id}@${attributes.version} (pack ${manifest.package.version}; ${attributes.license})`,
      generated: false,
      referenceQuestionIds: [],
    }),
  };
}

function isWithin(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

async function markdownFiles(
  root: string,
  interviewRoot: string,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(/* turbopackIgnore: true */ root, { withFileTypes: true })) {
    const absolute = path.join(/* turbopackIgnore: true */ root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `面试题目录不允许符号链接: ${path.relative(interviewRoot, absolute)}`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(absolute, interviewRoot)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(
        path.relative(interviewRoot, absolute).split(path.sep).join("/"),
      );
    }
  }
  return files.sort(asciiCompare);
}

async function validateQuestionFiles(
  interviewRoot: string,
  manifest: Manifest,
) {
  const questionRoot = path.join(/* turbopackIgnore: true */ interviewRoot, "questions");
  const realQuestionRoot = await realpath(/* turbopackIgnore: true */ questionRoot);
  const listedPaths = new Set<string>();

  for (const item of manifest.questions) {
    const absolute = path.resolve(/* turbopackIgnore: true */ interviewRoot, item.path);
    if (!isWithin(questionRoot, absolute)) {
      throw new Error(`面试题库路径超出 questions 目录: ${item.path}`);
    }
    const resolved = await realpath(/* turbopackIgnore: true */ absolute);
    if (!isWithin(realQuestionRoot, resolved)) {
      throw new Error(`面试题库真实路径超出 questions 目录: ${item.path}`);
    }
    listedPaths.add(item.path);
  }

  const existingPaths = await markdownFiles(questionRoot, interviewRoot);
  const unlisted = existingPaths.filter((file) => !listedPaths.has(file));
  const missing = [...listedPaths].filter(
    (file) => !existingPaths.includes(file),
  );
  if (unlisted.length || missing.length) {
    const details = [
      unlisted.length ? `未登记: ${unlisted.join(", ")}` : "",
      missing.length ? `不存在: ${missing.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("；");
    throw new Error(
      `manifest 必须与 questions 目录中的 Markdown 文件完全一致（${details}）。`,
    );
  }
}

function asciiCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function searchTokens(value: string) {
  return new Set(normalizeSearchValue(value).split(/\s+/).filter(Boolean));
}

function overlap(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function localeMatches(question: InterviewQuestion, locale: Locale) {
  if (locale === "mixed") return true;
  if (locale === "zh-TW")
    return question.locale === "zh-TW" || question.locale === "zh-CN";
  return question.locale === locale;
}

/** Deterministically ranks a validated catalog by locale, role family, then requested skills. */
export function selectInterviewQuestions(
  catalog: readonly InterviewQuestion[],
  selection: InterviewQuestionSelection,
): InterviewQuestion[] {
  const input = SelectionSchema.parse(selection);
  const normalizedRole = input.role ? normalizeSearchValue(input.role) : "";
  const roleTokens = searchTokens(input.role ?? "");
  const requestedSkills = new Set(input.skills.map(normalizeSearchValue));
  const requestedSkillTokens = searchTokens(input.skills.join(" "));

  return catalog
    .filter((question) => localeMatches(question, input.locale))
    .map((question) => {
      const families = question.roleFamilies.map(normalizeSearchValue);
      const skills = question.skills.map(normalizeSearchValue);
      const familyTokens = searchTokens(families.join(" "));
      const skillTokens = searchTokens(skills.join(" "));
      const exactRole =
        normalizedRole && families.includes(normalizedRole) ? 1 : 0;
      const exactSkills = skills.filter((skill) =>
        requestedSkills.has(skill),
      ).length;
      const score =
        exactRole * 8 +
        overlap(familyTokens, roleTokens) * 3 +
        exactSkills * 5 +
        overlap(skillTokens, requestedSkillTokens);
      return { question, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        asciiCompare(left.question.id, right.question.id),
    )
    .slice(0, input.limit)
    .map(({ question }) => question);
}

const catalogCache = new Map<string, Promise<InterviewQuestion[]>>();

async function loadCatalog(locale: Locale, interviewRoot: string) {
  const manifestPath = path.join(/* turbopackIgnore: true */ interviewRoot, "manifest.yaml");
  const manifest = ManifestSchema.parse(
    parseYaml(await readFile(/* turbopackIgnore: true */ manifestPath, "utf8")),
  );
  await validateQuestionFiles(interviewRoot, manifest);

  const questions = await Promise.all(
    manifest.questions.map(async (item) => {
      const parsed = questionFromMarkdown(
        await readFile(
          /* turbopackIgnore: true */ path.join(
            /* turbopackIgnore: true */ interviewRoot,
            item.path,
          ),
          "utf8",
        ),
        locale,
        manifest,
      );
      if (parsed.question.id !== item.id) {
        throw new Error(
          `面试题 ID 与 manifest 不一致: ${item.id} != ${parsed.question.id}`,
        );
      }
      if (
        parsed.attributes.source.length === 0 ||
        parsed.attributes.license.length === 0
      ) {
        throw new Error(`面试题 ${item.id} 缺少来源或许可证。`);
      }
      return parsed.question;
    }),
  );

  if (
    new Set(questions.map((question) => question.id)).size !== questions.length
  ) {
    throw new Error("转换后的面试题 ID 不唯一。");
  }
  return questions;
}

/** Loads the content-only interview pack and converts every unit to InterviewQuestionSchema. */
export function loadInterviewQuestionCatalog(
  locale: Locale,
  options: InterviewKnowledgeLoadOptions = {},
) {
  const validatedLocale = LocaleSchema.parse(locale);
  const interviewRoot = path.resolve(
    /* turbopackIgnore: true */
    options.interviewRoot ??
      path.join(
        /* turbopackIgnore: true */ process.cwd(),
        "content",
        "interview",
      ),
  );
  const useCache = options.cache ?? options.interviewRoot === undefined;
  const cacheKey = `${interviewRoot}\u0000${validatedLocale}`;
  if (!useCache) return loadCatalog(validatedLocale, interviewRoot);

  const existing = catalogCache.get(cacheKey);
  if (existing) return existing;
  const loading = loadCatalog(validatedLocale, interviewRoot).catch((error) => {
    catalogCache.delete(cacheKey);
    throw error;
  });
  catalogCache.set(cacheKey, loading);
  return loading;
}

/** Convenience helper for server callers that want loading and deterministic retrieval in one call. */
export async function retrieveInterviewQuestions(
  selection: InterviewQuestionSelection,
) {
  const input = SelectionSchema.parse(selection);
  const catalog = await loadInterviewQuestionCatalog(input.locale);
  return selectInterviewQuestions(catalog, input);
}

export function clearInterviewKnowledgeCache() {
  catalogCache.clear();
}
