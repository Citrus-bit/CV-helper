import { randomUUID } from "node:crypto";

import { invokeBaselineCapability } from "@/lib/baseline";
import type { CapabilityContext, DataScope } from "@/lib/capabilities";
import { AI_CAPABILITY_TIMEOUT_MS } from "@/lib/capabilities/catalog";
import { AnalysisBundleSchema, type AnalysisBundle } from "@/lib/client/contracts";
import {
  ResumeASTSchema,
  ResumeDocumentSchema,
  type Locale,
  type ResumeAST,
  type ResumeDocument,
  type ResumeEntry,
  type ResumeSection,
  type ResumeSectionType,
  type SourceBlock,
} from "@/lib/domain";
import type { ParsedPdfResult, ParsedSourceBlock } from "@/lib/server/pdf";
import {
  invokeCapability,
  invokeRequiredAiCapability,
} from "@/lib/server/capability-runtime";
import {
  isExplicitResumeBullet,
  mergeVisualResumeLines,
} from "@/lib/resume-line-normalization";

type ResumeLine = {
  text: string;
  blockIds: string[];
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type SectionSeed = {
  type: ResumeSectionType;
  title: string;
  headingBlockIds: string[];
  lines: ResumeLine[];
};

const SECTION_ALIASES: Array<{ type: ResumeSectionType; aliases: string[] }> = [
  { type: "summary", aliases: ["个人简介", "个人总结", "职业概要", "自我评价", "profile", "summary", "professional summary", "objective"] },
  { type: "experience", aliases: ["工作经历", "工作经验", "职业经历", "实习经历", "experience", "work experience", "professional experience", "employment"] },
  { type: "education", aliases: ["教育背景", "教育经历", "学习经历", "education", "academic background"] },
  { type: "projects", aliases: ["项目经历", "项目经验", "项目实践", "projects", "project experience", "selected projects"] },
  { type: "skills", aliases: ["核心技能", "专业技能", "技能", "技术栈", "skills", "core skills", "technical skills", "competencies"] },
  { type: "certifications", aliases: ["证书", "资质证书", "资格证书", "certifications", "licenses"] },
  { type: "awards", aliases: ["荣誉奖项", "奖项", "荣誉", "awards", "honors"] },
  { type: "publications", aliases: ["发表论文", "出版物", "论文", "publications", "research"] },
  { type: "languages", aliases: ["语言能力", "语言", "languages"] },
];

const DATE_PATTERN = /(?:19|20)\d{2}(?:[.\/-]\d{1,2})?\s*(?:-|--|~|至|to)\s*(?:(?:19|20)\d{2}(?:[.\/-]\d{1,2})?|至今|现在|present|current)|(?:19|20)\d{2}(?:[.\/-]\d{1,2})?/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?<!\d)(?:(?:\+?86[-\s]?)?1[3-9]\d{9}|(?:\+?\d{1,3}[-\s]?)?(?:\d[-\s]?){7,12})(?!\d)/;
const URL_PATTERN = /(?:https?:\/\/|www\.|linkedin\.com|github\.com)[^\s,，;；]+/i;

function normalized(text: string) {
  return text.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
}

function headingKey(text: string) {
  return normalized(text).toLowerCase().replace(/[\s:：|｜/\\\-_]+/g, "");
}

function sectionType(text: string): ResumeSectionType | undefined {
  const key = headingKey(text);
  return SECTION_ALIASES.find((candidate) => candidate.aliases.some((alias) => headingKey(alias) === key))?.type;
}

function detectLocale(text: string): Locale {
  const han = text.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  if (han >= 10 && latin >= 30) return "mixed";
  return han > latin * 0.2 ? "zh-CN" : "en-US";
}

function needsSpace(left: ParsedSourceBlock, right: ParsedSourceBlock) {
  const gap = right.bbox.x - (left.bbox.x + left.bbox.width);
  if (gap > 0.006) return true;
  return /[A-Za-z0-9)]$/.test(left.text) && /^[A-Za-z0-9(]/.test(right.text);
}

function nativeLines(blocks: ParsedSourceBlock[]): ResumeLine[] {
  const clusters: Array<{ y: number; blocks: ParsedSourceBlock[] }> = [];
  for (const block of blocks.slice().sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x || a.order - b.order)) {
    const cluster = clusters.find((candidate) => {
      const tolerance = Math.max(0.006, Math.min(0.018, Math.max(block.bbox.height, candidate.blocks[0]?.bbox.height ?? 0) * 0.65));
      return Math.abs(candidate.y - block.bbox.y) <= tolerance;
    });
    if (cluster) {
      cluster.blocks.push(block);
      cluster.y = (cluster.y * (cluster.blocks.length - 1) + block.bbox.y) / cluster.blocks.length;
    } else {
      clusters.push({ y: block.bbox.y, blocks: [block] });
    }
  }
  return clusters.map((cluster) => {
    const fragments = cluster.blocks.slice().sort((a, b) => a.bbox.x - b.bbox.x || a.order - b.order);
    let text = "";
    fragments.forEach((fragment, index) => {
      if (index > 0 && needsSpace(fragments[index - 1], fragment)) text += " ";
      text += fragment.text;
    });
    const minX = Math.min(...fragments.map((block) => block.bbox.x));
    const maxX = Math.max(...fragments.map((block) => block.bbox.x + block.bbox.width));
    return {
      text: normalized(text),
      blockIds: fragments.map((block) => block.id),
      pageIndex: fragments[0].pageIndex,
      x: minX,
      y: Math.min(...fragments.map((block) => block.bbox.y)),
      width: Math.max(0, maxX - minX),
      height: Math.max(...fragments.map((block) => block.bbox.height)),
    };
  });
}

function ocrLines(blocks: ParsedSourceBlock[]): ResumeLine[] {
  return blocks.flatMap((block) =>
    block.text
      .split(/\r?\n/)
      .map(normalized)
      .filter(Boolean)
      .map((text, index) => ({
        text,
        blockIds: [block.id],
        pageIndex: block.pageIndex,
        x: block.bbox.x,
        y: block.bbox.y + block.bbox.height * (index / Math.max(1, block.text.split(/\r?\n/).length)),
        width: block.bbox.width,
        height: block.bbox.height / Math.max(1, block.text.split(/\r?\n/).length),
      })),
  );
}

function buildLines(blocks: ParsedSourceBlock[]) {
  const pages = new Map<number, ParsedSourceBlock[]>();
  for (const block of blocks) pages.set(block.pageIndex, [...(pages.get(block.pageIndex) ?? []), block]);
  return [...pages.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, pageBlocks]) => {
      const native = nativeLines(pageBlocks.filter((block) => block.source === "pdf"));
      const ocr = ocrLines(pageBlocks.filter((block) => block.source === "ocr"));
      return [...native, ...ocr].filter((line) => line.text).sort((a, b) => a.y - b.y || a.x - b.x);
    });
}

function entryFromLines(lines: ResumeLine[], sectionIndex: number, entryIndex: number): ResumeEntry {
  const dateLine = lines.find((line) => DATE_PATTERN.test(line.text));
  const date = dateLine?.text.match(DATE_PATTERN)?.[0];
  const titleLine = lines.find((line) => normalized(line.text.replace(DATE_PATTERN, "").replace(/^[|｜·•\-\s]+|[|｜·•\-\s]+$/g, "")));
  const title = titleLine ? normalized(titleLine.text.replace(DATE_PATTERN, "").replace(/^[|｜·•\-\s]+|[|｜·•\-\s]+$/g, "")) : "";
  const remaining = lines.filter((line) => line !== titleLine && line !== dateLine);
  const logicalBullets = mergeVisualResumeLines(remaining);
  return {
    id: `entry-${sectionIndex + 1}-${entryIndex + 1}`,
    title,
    startDate: date,
    bullets: logicalBullets.map((line) => line.text),
    keywords: [],
    sourceBlockIds: [...new Set(lines.flatMap((line) => line.blockIds))],
    current: /(?:至今|现在|present|current)/i.test(date ?? ""),
  };
}

function splitEntryLines(lines: ResumeLine[]) {
  if (lines.length < 2) return lines.length ? [lines] : [];
  const groups: ResumeLine[][] = [];
  let current: ResumeLine[] = [];
  for (const line of lines) {
    const startsNewEntry = DATE_PATTERN.test(line.text) && current.some((candidate) => DATE_PATTERN.test(candidate.text));
    if (startsNewEntry && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) groups.push(current);
  return groups;
}

function sectionFromSeed(seed: SectionSeed, index: number): ResumeSection {
  const sourceBlockIds = [...new Set([...seed.headingBlockIds, ...seed.lines.flatMap((line) => line.blockIds)])];
  if (seed.type === "summary") {
    return {
      id: `section-${index + 1}`,
      type: seed.type,
      title: seed.title,
      entries: [],
      text: seed.lines.map((line) => line.text).join(" "),
      sourceBlockIds,
    };
  }
  const entryGroups = splitEntryLines(seed.lines);
  return {
    id: `section-${index + 1}`,
    type: seed.type,
    title: seed.title,
    entries: entryGroups.map((group, entryIndex) => entryFromLines(group, index, entryIndex)),
    sourceBlockIds,
  };
}

function inferAst(parsed: ParsedPdfResult) {
  const lines = buildLines(parsed.blocks);
  const firstHeadingIndex = lines.findIndex((line) => sectionType(line.text));
  const preamble = firstHeadingIndex >= 0 ? lines.slice(0, firstHeadingIndex) : lines.slice(0, Math.min(lines.length, 4));
  const emailLine = lines.find((line) => EMAIL_PATTERN.test(line.text));
  const phoneLine = lines.find((line) => PHONE_PATTERN.test(line.text));
  const urlLines = lines.filter((line) => URL_PATTERN.test(line.text));
  const contactIds = new Set([emailLine, phoneLine, ...urlLines].filter(Boolean).flatMap((line) => line?.blockIds ?? []));
  const identityCandidates = preamble.filter(
    (line) => !EMAIL_PATTERN.test(line.text) && !PHONE_PATTERN.test(line.text) && !URL_PATTERN.test(line.text) && !DATE_PATTERN.test(line.text),
  );
  const nameLine = identityCandidates.find((line) => line.text.length <= 80);
  const headlineLine = identityCandidates.find((line) => line !== nameLine && line.text.length <= 160);
  const excludedPreamble = new Set([nameLine, headlineLine, emailLine, phoneLine, ...urlLines].filter(Boolean));
  const preambleSummary = preamble.filter((line) => !excludedPreamble.has(line));

  const seeds: SectionSeed[] = [];
  let current: SectionSeed | undefined;
  const sectionStart = firstHeadingIndex >= 0 ? firstHeadingIndex : Math.min(lines.length, 4);
  for (const line of lines.slice(sectionStart)) {
    const type = sectionType(line.text);
    if (type) {
      current = { type, title: line.text, headingBlockIds: line.blockIds, lines: [] };
      seeds.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (preambleSummary.length) {
    seeds.unshift({
      type: "summary",
      title: detectLocale(parsed.text) === "en-US" ? "Summary" : "个人简介",
      headingBlockIds: [],
      lines: preambleSummary,
    });
  }
  if (!seeds.length) {
    const remaining = lines.filter((line) => !excludedPreamble.has(line));
    seeds.push({
      type: "custom",
      title: detectLocale(parsed.text) === "en-US" ? "Resume content" : "简历内容",
      headingBlockIds: [],
      lines: remaining,
    });
  }

  const links = urlLines.flatMap((line) => {
    const url = line.text.match(URL_PATTERN)?.[0];
    return url ? [{ label: url.includes("linkedin") ? "LinkedIn" : url.includes("github") ? "GitHub" : "Link", url: url.startsWith("http") ? url : `https://${url}` }] : [];
  });
  const locale = detectLocale(parsed.text);
  const sections = seeds.map(sectionFromSeed).filter((section) => section.entries.length > 0 || Boolean(section.text));
  const summary = sections.find((section) => section.type === "summary")?.text;
  const ast = ResumeASTSchema.parse({
    schemaVersion: "1.0",
    locale,
    contact: {
      name: nameLine?.text ?? "",
      headline: headlineLine?.text,
      email: emailLine?.text.match(EMAIL_PATTERN)?.[0],
      phone: phoneLine?.text.match(PHONE_PATTERN)?.[0],
      links,
    },
    summary,
    sections,
  });

  const headingIds = new Set(seeds.flatMap((seed) => seed.headingBlockIds));
  const listItemIds = new Set(
    seeds.flatMap((seed) =>
      seed.lines
        .filter((line) => isExplicitResumeBullet(line.text))
        .flatMap((line) => line.blockIds),
    ),
  );
  return { ast, headingIds, contactIds, listItemIds };
}

function sourceBlocks(
  parsed: ParsedPdfResult,
  roles: { headingIds: Set<string>; contactIds: Set<string>; listItemIds: Set<string> },
): SourceBlock[] {
  return parsed.blocks.map((block) => ({
    id: block.id,
    pageIndex: block.pageIndex,
    order: block.order,
    text: block.text,
    bbox: block.bbox,
    source: block.source === "pdf" ? "native" : "ocr",
    confidence: block.confidence,
    style: block.style,
    role: roles.headingIds.has(block.id)
      ? "heading"
      : roles.contactIds.has(block.id)
        ? "contact"
        : roles.listItemIds.has(block.id)
          ? "list-item"
          : block.role && block.role !== "unknown"
            ? block.role
            : "paragraph",
  }));
}

function linkAstSources(astInput: ResumeAST, blocks: SourceBlock[]) {
  const ast = structuredClone(astInput);
  const matchingIds = (text: string) => {
    const compact = normalized(text).replace(/\s/g, "");
    return blocks
      .filter((block) => {
        const candidate = normalized(block.text).replace(/\s/g, "");
        return candidate && (candidate.includes(compact) || compact.includes(candidate));
      })
      .map((block) => block.id);
  };
  ast.sections.forEach((section) => {
    section.entries.forEach((entry) => {
      entry.sourceBlockIds = [...new Set([entry.title, entry.subtitle, entry.organization, entry.summary, ...entry.bullets].filter(Boolean).flatMap((text) => matchingIds(text!)))];
    });
    section.sourceBlockIds = [...new Set([section.title, section.text, ...section.entries.flatMap((entry) => [entry.title, ...entry.bullets])].filter(Boolean).flatMap((text) => matchingIds(text!)))];
  });
  return ResumeASTSchema.parse(ast);
}

export function createCapabilityContext(
  locale: Locale,
  grantedDataScopes: readonly DataScope[],
  signal?: AbortSignal,
  deadlineMs = 30_000,
): CapabilityContext {
  return {
    sessionId: `anonymous-${randomUUID()}`,
    locale,
    grantedDataScopes,
    traceId: randomUUID(),
    deadlineAt: new Date(Date.now() + Math.max(1, deadlineMs)).toISOString(),
    signal,
  };
}

export function resumeDocumentFromParsed(
  parsed: ParsedPdfResult,
  options: { ast?: ResumeAST; resumeId?: string } = {},
): ResumeDocument {
  const inferred = inferAst(parsed);
  const blocks = sourceBlocks(parsed, inferred);
  const ast = options.ast ? linkAstSources(ResumeASTSchema.parse(options.ast), blocks) : inferred.ast;
  const createdAt = new Date();
  return ResumeDocumentSchema.parse({
    id: options.resumeId ?? `resume-${randomUUID()}`,
    revision: 0,
    originalFileName: parsed.fileName,
    mimeType: "application/pdf",
    locale: ast.locale,
    pageCount: parsed.pageCount,
    parseMethod: parsed.extractionMode === "hybrid" ? "mixed" : parsed.extractionMode,
    sourceBlocks: blocks,
    ast,
    parsingWarnings: parsed.warnings,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
  });
}

export async function analyzeParsedResume(
  parsed: ParsedPdfResult,
  options: {
    ast?: ResumeAST;
    resumeId?: string;
    signal?: AbortSignal;
    originalPdfBase64?: string;
    documentCapabilityVersions?: Record<string, string>;
    requireAi?: boolean;
  } = {},
): Promise<AnalysisBundle> {
  const startedAt = performance.now();
  const resume = resumeDocumentFromParsed(parsed, options);
  const securityContext = createCapabilityContext(
    resume.locale,
    ["selected_text"],
    options.signal,
  );
  const [guardResult, redactionResult] = await Promise.all([
    invokeBaselineCapability("prompt.guard", { text: parsed.text }, securityContext),
    invokeBaselineCapability("pii.redact", { text: parsed.text }, securityContext),
  ]);
  if (guardResult.data.suspicious) {
    resume.parsingWarnings.push("文档中包含类似指令的文本，已仅当作不可信简历内容处理。");
  }
  const context = createCapabilityContext(
    resume.locale,
    ["source_blocks", "resume_ast", "evidence_graph"],
    options.signal,
    AI_CAPABILITY_TIMEOUT_MS,
  );
  const evidenceResult = await invokeBaselineCapability("evidence.mine", { resume }, context);
  const assessmentResults = await Promise.all(
    evidenceResult.data.claims.map((claim) =>
      invokeBaselineCapability(
        "claim.assess",
        { claim, evidenceAssets: evidenceResult.data.evidenceAssets },
        context,
      ),
    ),
  );
  const assessedClaims = assessmentResults.map((result) => result.data);
  const conflictResult = await invokeBaselineCapability("claim.conflict", { claims: assessedClaims }, context);
  const conflictingIds = new Set(conflictResult.data.conflicts.flatMap((conflict) => conflict.claimIds));
  const claims = assessedClaims.map((claim) =>
    conflictingIds.has(claim.id) ? { ...claim, status: "conflicting" as const, confidence: Math.min(claim.confidence, 0.65) } : claim,
  );
  const atsResultPromise = invokeBaselineCapability("resume.atsAudit", { resume }, context);
  // Provider gateways commonly enforce token budgets across concurrent requests.
  // Keep the two large structured completions serial so one analysis cannot
  // reject both enhancements at once while the local ATS audit runs in parallel.
  const invokeResumeCapability = options.requireAi
    ? invokeRequiredAiCapability
    : invokeCapability;
  const scoreResult = await invokeResumeCapability(
    "resume.score",
    { resume, claims },
    context,
  );
  const suggestionResult = await invokeResumeCapability(
    "resume.suggest",
    { resume, claims, scoreContext: scoreResult.data },
    context,
  );
  const atsResult = await atsResultPromise;
  const storyResults = await Promise.all(
    claims.slice(0, 8).map((claim) =>
      invokeBaselineCapability(
        "story.build",
        { claim, evidenceAssets: evidenceResult.data.evidenceAssets },
        context,
      ),
    ),
  );
  return AnalysisBundleSchema.parse({
    resume,
    evidence: evidenceResult.data.evidenceAssets,
    claims,
    scorecard: { ...scoreResult.data, sourceVersion: scoreResult.sourceVersion },
    atsAudit: { ...atsResult.data, sourceVersion: atsResult.sourceVersion },
    suggestions: suggestionResult.data.suggestions,
    stories: storyResults.map((result) => result.data),
    originalPdfBase64: options.originalPdfBase64,
    processing: {
      extractionMode: parsed.extractionMode,
      durationMs: performance.now() - startedAt,
      capabilityVersions: {
        "document.parse": "builtin.pdfjs@1.0.0",
        ...(parsed.extractionMode !== "native" ? { "document.ocr": "builtin.tesseract@1.0.0" } : {}),
        "document.segment": "builtin.resume-segmenter@1.0.0",
        ...options.documentCapabilityVersions,
        "prompt.guard": guardResult.sourceVersion,
        "pii.redact": redactionResult.sourceVersion,
        "evidence.mine": evidenceResult.sourceVersion,
        ...(assessmentResults[0] ? { "claim.assess": assessmentResults[0].sourceVersion } : {}),
        "claim.conflict": conflictResult.sourceVersion,
        "resume.score": scoreResult.sourceVersion,
        "resume.suggest": suggestionResult.sourceVersion,
        "resume.atsAudit": atsResult.sourceVersion,
        ...(storyResults[0] ? { "story.build": storyResults[0].sourceVersion } : {}),
      },
      aiAnalysis: {
        status:
          /^resume\.score@(?:[2-9]|\d{2,})\./.test(scoreResult.sourceVersion) &&
          /^resume\.suggest@(?:[2-9]|\d{2,})\./.test(
            suggestionResult.sourceVersion,
          )
            ? "fresh"
            : "failed",
        analyzedRevision: resume.revision,
        scoreSourceVersion: scoreResult.sourceVersion,
        suggestionSourceVersion: suggestionResult.sourceVersion,
      },
    },
  });
}

export const DEMO_RESUME_AST = ResumeASTSchema.parse({
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: {
    name: "林晓辰",
    headline: "高级产品经理 | AI 产品与增长",
    email: "xiaocen.lin@example.com",
    phone: "+86 138 0000 0000",
    location: "上海",
    links: [],
  },
  summary: "7 年互联网产品经验，专注 AI 工具与 B2B SaaS。擅长将用户研究、数据分析与跨团队协作转化为可衡量的业务结果。",
  sections: [
    {
      id: "demo-summary",
      type: "summary",
      title: "个人简介",
      text: "7 年互联网产品经验，专注 AI 工具与 B2B SaaS。擅长将用户研究、数据分析与跨团队协作转化为可衡量的业务结果。",
      entries: [],
      sourceBlockIds: [],
    },
    {
      id: "demo-experience",
      type: "experience",
      title: "工作经历",
      entries: [
        {
          id: "demo-role-1",
          title: "高级产品经理",
          organization: "星海科技",
          startDate: "2022.04",
          endDate: "至今",
          current: true,
          bullets: [
            "主要负责 AI 知识库产品从 0 到 1，联合研发与设计团队完成 3 个行业版本上线。",
            "通过漏斗分析重构引导流程，将新用户 7 日激活率从 42% 提升至 61%。",
          ],
          keywords: ["AI", "B2B SaaS", "漏斗分析"],
          sourceBlockIds: [],
        },
      ],
      sourceBlockIds: [],
    },
    {
      id: "demo-education",
      type: "education",
      title: "教育背景",
      entries: [
        {
          id: "demo-education-1",
          title: "管理科学与工程 硕士",
          organization: "同济大学",
          startDate: "2015.09",
          endDate: "2018.06",
          current: false,
          bullets: [],
          keywords: [],
          sourceBlockIds: [],
        },
      ],
      sourceBlockIds: [],
    },
    {
      id: "demo-skills",
      type: "skills",
      title: "核心技能",
      entries: [
        {
          id: "demo-skills-1",
          title: "产品与数据",
          current: false,
          bullets: ["AI 产品设计、用户研究、SQL、A/B 测试、指标体系、项目管理"],
          keywords: ["SQL", "A/B 测试", "用户研究"],
          sourceBlockIds: [],
        },
      ],
      sourceBlockIds: [],
    },
  ],
});
