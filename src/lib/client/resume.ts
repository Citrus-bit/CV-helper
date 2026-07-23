import { ResumeASTSchema, type ResumeAST, type ResumeEntry, type ResumeSection, type Suggestion } from "@/lib/domain";
import type { RenderableResume } from "@/lib/server/typst";

const blockedPointerSegments = new Set(["__proto__", "constructor", "prototype"]);
const allowedRoots = new Set(["contact", "summary", "sections"]);

function replaceText(value: string | undefined, before: string, after: string) {
  if (!value || !before || !value.includes(before)) return value;
  return value.replace(before, after);
}

function replaceInEntry(entry: ResumeEntry, before: string, after: string): ResumeEntry {
  return {
    ...entry,
    title: replaceText(entry.title, before, after) ?? entry.title,
    subtitle: replaceText(entry.subtitle, before, after),
    organization: replaceText(entry.organization, before, after),
    summary: replaceText(entry.summary, before, after),
    bullets: entry.bullets.map((bullet) => replaceText(bullet, before, after) ?? bullet),
  };
}

function pointerSegments(path: string): string[] | null {
  if (!path.startsWith("/")) return null;
  const segments = path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (!segments[0] || !allowedRoots.has(segments[0]) || segments.some((segment) => blockedPointerSegments.has(segment))) {
    return null;
  }
  return segments;
}

function applyPatch(target: unknown, suggestion: Suggestion): ResumeAST | null {
  if (!suggestion.patches.length) return null;
  const draft = structuredClone(target) as Record<string, unknown>;
  let changed = false;
  let usedManualValue = false;

  for (const patch of suggestion.patches) {
    const segments = pointerSegments(patch.path);
    if (!segments) return null;
    let parent: unknown = draft;

    for (const segment of segments.slice(0, -1)) {
      if (Array.isArray(parent)) {
        if (!/^\d+$/.test(segment)) return null;
        parent = parent[Number(segment)];
      } else if (parent && typeof parent === "object") {
        if (!Object.hasOwn(parent, segment)) return null;
        parent = (parent as Record<string, unknown>)[segment];
      } else {
        return null;
      }
    }

    const key = segments.at(-1)!;
    const manualValue =
      !usedManualValue &&
      suggestion.status === "manual" &&
      patch.operation !== "remove" &&
      typeof patch.value === "string"
        ? suggestion.proposedText
        : undefined;
    const value = manualValue ?? patch.value;
    if (manualValue !== undefined) usedManualValue = true;

    if (Array.isArray(parent)) {
      if (!/^\d+$/.test(key)) return null;
      const index = Number(key);
      if (patch.operation === "add") {
        if (index < 0 || index > parent.length) return null;
        parent.splice(index, 0, value);
        changed = true;
      } else {
        if (index < 0 || index >= parent.length) return null;
        if (patch.operation === "remove") {
          parent.splice(index, 1);
          changed = true;
        } else if (JSON.stringify(parent[index]) !== JSON.stringify(value)) {
          parent[index] = value;
          changed = true;
        }
      }
    } else if (parent && typeof parent === "object") {
      const record = parent as Record<string, unknown>;
      if (patch.operation !== "add" && !Object.hasOwn(record, key)) return null;
      if (patch.operation === "remove") {
        delete record[key];
        changed = true;
      } else if (!Object.hasOwn(record, key) || JSON.stringify(record[key]) !== JSON.stringify(value)) {
        record[key] = value;
        changed = true;
      }
    } else {
      return null;
    }
  }

  if (!changed) return null;
  const parsed = ResumeASTSchema.safeParse(draft);
  if (!parsed.success || JSON.stringify(parsed.data) === JSON.stringify(target)) return null;
  return parsed.data;
}

export function applySuggestion(ast: ResumeAST, suggestion: Suggestion): ResumeAST {
  const patched = applyPatch(ast, suggestion);
  if (patched) return patched;
  if (suggestion.patches.length > 0) return ast;
  if (!suggestion.originalText) return ast;
  const before = suggestion.originalText;
  const after = suggestion.kind === "remove" ? "" : suggestion.proposedText;
  if (after === undefined) return ast;
  const next = {
    ...ast,
    summary: replaceText(ast.summary, before, after),
    sections: ast.sections.map((section) => ({
      ...section,
      text: replaceText(section.text, before, after),
      entries: section.entries.map((entry) => replaceInEntry(entry, before, after)),
    })),
  };
  return JSON.stringify(next) === JSON.stringify(ast) ? ast : next;
}

function sectionItems(section: ResumeSection): RenderableResume["sections"][number]["items"] {
  if (section.entries.length > 0) {
    return section.entries.map((entry) => ({
      title: entry.title,
      subtitle: entry.organization ?? entry.subtitle,
      date: [entry.startDate, entry.endDate].filter(Boolean).join(" - "),
      bullets: entry.bullets.length > 0 ? entry.bullets : entry.summary ? [entry.summary] : [],
    }));
  }
  return section.text
    ? [{ title: "", bullets: section.text.split(/\n+/).filter(Boolean) }]
    : [];
}

export function toRenderableResume(ast: ResumeAST): RenderableResume {
  return {
    profile: {
      name: ast.contact.name || "候选人",
      headline: ast.contact.headline,
      email: ast.contact.email,
      phone: ast.contact.phone,
      location: ast.contact.location,
      summary: ast.summary,
    },
    sections: ast.sections.map((section) => ({
      title: section.title,
      items: sectionItems(section),
    })),
  };
}
