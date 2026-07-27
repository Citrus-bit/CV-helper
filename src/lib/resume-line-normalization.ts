import {
  ResumeASTSchema,
  type ResumeAST,
  type ResumeDocument,
  type SourceBlock,
} from "@/lib/domain";

const BULLET_PREFIX = /^[\s\u00a0]*[•·●▪■\-–—]\s*/u;
const TERMINAL_PUNCTUATION = /[。！？.!?；;:]\s*$/u;

export type VisualResumeLine = {
  text: string;
  blockIds: string[];
  pageIndex: number;
  x: number;
  y: number;
  height: number;
};

export type LogicalResumeLine = VisualResumeLine & {
  explicitBullet: boolean;
};

function normalizedText(value: string) {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
}

function compactText(value: string) {
  return normalizedText(value)
    .replace(BULLET_PREFIX, "")
    .replace(/[\s，。；、,.!?！？:：()（）\[\]{}<>《》/_\\\-]+/g, "")
    .toLowerCase();
}

export function joinResumeText(left: string, right: string) {
  const normalizedLeft = normalizedText(left);
  const normalizedRight = normalizedText(right);
  if (!normalizedLeft) return normalizedRight;
  if (!normalizedRight) return normalizedLeft;
  const leftCharacter = normalizedLeft.at(-1) ?? "";
  const rightCharacter = normalizedRight.at(0) ?? "";
  const joinsWithoutSpace =
    /[\p{Script=Han}\-–—/]/u.test(leftCharacter) ||
    /^[\p{Script=Han}，。！？；：、,.!?;:%％)）\]】]/u.test(rightCharacter);
  return `${normalizedLeft}${joinsWithoutSpace ? "" : " "}${normalizedRight}`;
}

export function normalizeBulletText(value: string) {
  return value
    .split(/\r?\n+/)
    .map((line) => normalizedText(line.replace(BULLET_PREFIX, "")))
    .filter(Boolean)
    .reduce((joined, line) => joinResumeText(joined, line), "");
}

function shouldContinueVisualLine(
  current: LogicalResumeLine,
  previousPhysicalLine: VisualResumeLine,
  next: VisualResumeLine,
  explicitBullet: boolean,
) {
  if (explicitBullet || next.pageIndex !== previousPhysicalLine.pageIndex) {
    return false;
  }
  const verticalGap = next.y - (previousPhysicalLine.y + previousPhysicalLine.height);
  const lineHeight = Math.max(previousPhysicalLine.height, next.height, 0.008);
  if (verticalGap > lineHeight * 1.8) return false;
  if (next.x < current.x - 0.015) return false;
  if (
    TERMINAL_PUNCTUATION.test(current.text) &&
    Math.abs(next.x - current.x) <= 0.015
  ) {
    return false;
  }
  return true;
}

export function mergeVisualResumeLines(
  lines: readonly VisualResumeLine[],
): LogicalResumeLine[] {
  const logical: LogicalResumeLine[] = [];
  let previousPhysicalLine: VisualResumeLine | null = null;

  for (const line of lines) {
    const explicitBullet = BULLET_PREFIX.test(line.text);
    const text = normalizeBulletText(line.text);
    if (!text) continue;
    const current = logical.at(-1);
    if (
      current &&
      previousPhysicalLine &&
      shouldContinueVisualLine(
        current,
        previousPhysicalLine,
        line,
        explicitBullet,
      )
    ) {
      current.text = joinResumeText(current.text, text);
      current.blockIds = [...new Set([...current.blockIds, ...line.blockIds])];
      current.height = Math.max(
        current.height,
        line.y + line.height - current.y,
      );
    } else {
      logical.push({ ...line, text, explicitBullet });
    }
    previousPhysicalLine = line;
  }

  return logical;
}

function explicitBulletBlocks(blocks: readonly SourceBlock[]) {
  return blocks.filter(
    (block) => block.role === "list-item" || BULLET_PREFIX.test(block.text),
  );
}

function bulletStartsExplicitSource(
  bullet: string,
  blocks: readonly SourceBlock[],
) {
  const compactBullet = compactText(bullet);
  if (!compactBullet) return false;
  return explicitBulletBlocks(blocks).some((block) => {
    const compactBlock = compactText(block.text);
    return (
      compactBlock.length >= 2 &&
      (compactBlock.includes(compactBullet) ||
        compactBullet.includes(compactBlock))
    );
  });
}

function repairEntryBullets(
  bullets: readonly string[],
  blocks: readonly SourceBlock[],
) {
  const repaired: string[] = [];
  let mergedCount = 0;
  const hasExplicitEvidence = explicitBulletBlocks(blocks).length > 0;

  for (const original of bullets) {
    const normalized = normalizeBulletText(original);
    if (!normalized) continue;
    if (normalized !== normalizedText(original.replace(BULLET_PREFIX, ""))) {
      mergedCount += 1;
    }
    const explicitStart = bulletStartsExplicitSource(normalized, blocks);
    const previous = repaired.at(-1);
    const shouldMerge =
      Boolean(previous) &&
      hasExplicitEvidence &&
      !explicitStart &&
      !TERMINAL_PUNCTUATION.test(previous ?? "");
    if (shouldMerge) {
      repaired[repaired.length - 1] = joinResumeText(previous ?? "", normalized);
      mergedCount += 1;
    } else {
      repaired.push(normalized);
    }
  }

  return { bullets: repaired, mergedCount };
}

export function repairResumeAstLineBreaks(
  resume: Pick<ResumeDocument, "ast" | "sourceBlocks">,
): { ast: ResumeAST; mergedCount: number } {
  const ast = structuredClone(resume.ast);
  const blocksById = new Map(
    resume.sourceBlocks.map((block) => [block.id, block]),
  );
  let mergedCount = 0;

  for (const section of ast.sections) {
    for (const entry of section.entries) {
      const blocks = entry.sourceBlockIds
        .map((blockId) => blocksById.get(blockId))
        .filter((block): block is SourceBlock => Boolean(block));
      const repaired = repairEntryBullets(entry.bullets, blocks);
      entry.bullets = repaired.bullets;
      mergedCount += repaired.mergedCount;
      if (entry.summary) entry.summary = normalizedText(entry.summary);
    }
  }

  return { ast: ResumeASTSchema.parse(ast), mergedCount };
}
