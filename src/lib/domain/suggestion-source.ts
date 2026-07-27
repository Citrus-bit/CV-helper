import type { ResumeDocument, SourceBlock, Suggestion } from "./schemas";

export type ResumeTextTarget = {
  text: string;
  sourceBlockIds: string[];
};

function normalizedSourceText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s，。；、,.!?！？:：()（）\[\]•·●▪|｜-]+/g, "");
}

export function resolveResumeTextTarget(
  resume: ResumeDocument,
  path: string,
): ResumeTextTarget | null {
  if (path === "/summary") {
    if (!resume.ast.summary) return null;
    return {
      text: resume.ast.summary,
      sourceBlockIds: resume.ast.sections
        .filter((section) => section.type === "summary")
        .flatMap((section) => section.sourceBlockIds),
    };
  }

  const sectionTextMatch = path.match(/^\/sections\/(\d+)\/text$/);
  if (sectionTextMatch) {
    const section = resume.ast.sections[Number(sectionTextMatch[1])];
    return section?.text
      ? { text: section.text, sourceBlockIds: section.sourceBlockIds }
      : null;
  }

  const entryTextMatch = path.match(
    /^\/sections\/(\d+)\/entries\/(\d+)\/(title|subtitle|organization|summary|bullets\/(\d+))$/,
  );
  if (!entryTextMatch) return null;
  const section = resume.ast.sections[Number(entryTextMatch[1])];
  const entry = section?.entries[Number(entryTextMatch[2])];
  if (!entry) return null;
  const field = entryTextMatch[3];
  const text = field.startsWith("bullets/")
    ? entry.bullets[Number(entryTextMatch[4])]
    : entry[field as "title" | "subtitle" | "organization" | "summary"];
  return typeof text === "string"
    ? { text, sourceBlockIds: entry.sourceBlockIds }
    : null;
}

function uniqueCompleteFragmentSequence(
  target: string,
  candidates: readonly SourceBlock[],
) {
  const matches = new Map<string, SourceBlock[]>();
  const pages = new Map<number, SourceBlock[]>();
  for (const block of candidates) {
    const fragment = normalizedSourceText(block.text);
    if (!fragment || !target.includes(fragment)) continue;
    pages.set(block.pageIndex, [...(pages.get(block.pageIndex) ?? []), block]);
  }

  for (const pageBlocks of pages.values()) {
    const ordered = pageBlocks.slice().sort((left, right) => left.order - right.order);
    for (let start = 0; start < ordered.length; start += 1) {
      const selected: SourceBlock[] = [];
      let cursor = 0;
      for (let index = start; index < ordered.length; index += 1) {
        const block = ordered[index];
        const fragment = normalizedSourceText(block.text);
        if (!target.startsWith(fragment, cursor)) continue;
        selected.push(block);
        cursor += fragment.length;
        if (cursor === target.length) {
          matches.set(
            selected.map((item) => item.id).join(":"),
            selected,
          );
          break;
        }
      }
    }
  }

  return matches.size === 1 ? [...matches.values()][0] : [];
}

function resolveSourceBlocks(
  text: string,
  candidates: readonly SourceBlock[],
): SourceBlock[] {
  const target = normalizedSourceText(text);
  if (!target) return [];

  const exact = candidates.filter(
    (block) => normalizedSourceText(block.text) === target,
  );
  if (exact.length === 1) return exact;
  if (exact.length > 1) return [];

  const containing = candidates.filter((block) =>
    normalizedSourceText(block.text).includes(target),
  );
  if (containing.length === 1) return containing;
  if (containing.length > 1) return [];

  return uniqueCompleteFragmentSequence(target, candidates);
}

export function resolveResumeTextSourceBlocks(
  resume: ResumeDocument,
  path: string,
  text: string,
): SourceBlock[] {
  const target = resolveResumeTextTarget(resume, path);
  if (!target) return [];
  const sourceIds = new Set(target.sourceBlockIds);
  return resolveSourceBlocks(
    text,
    resume.sourceBlocks.filter((block) => sourceIds.has(block.id)),
  );
}

export function resolveSuggestionSourceBlocks(
  resume: ResumeDocument,
  suggestion: Pick<Suggestion, "originalText" | "patches" | "sourceBlockIds">,
): SourceBlock[] {
  const patch = suggestion.patches.length === 1 ? suggestion.patches[0] : null;
  if (patch) {
    return resolveResumeTextSourceBlocks(
      resume,
      patch.path,
      suggestion.originalText,
    );
  }
  const sourceIds = new Set(suggestion.sourceBlockIds);
  return resolveSourceBlocks(
    suggestion.originalText,
    resume.sourceBlocks.filter((block) => sourceIds.has(block.id)),
  );
}
