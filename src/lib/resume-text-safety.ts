export type UnsupportedResumeCharacter = {
  character: string;
  codePoint: string;
  label: string;
};

function characterIssue(character: string): UnsupportedResumeCharacter | null {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return null;

  let label: string | null = null;
  if (
    codePoint <= 0x08 ||
    codePoint === 0x0b ||
    codePoint === 0x0c ||
    (codePoint >= 0x0e && codePoint <= 0x1f) ||
    (codePoint >= 0x7f && codePoint <= 0x9f)
  ) {
    label = "不可见控制字符";
  } else if (
    codePoint === 0x00ad ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    codePoint === 0xfeff ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  ) {
    label = "不可见格式字符";
  } else if (codePoint === 0x25a1) {
    label = "占位方框";
  } else if (codePoint === 0xfffc || codePoint === 0xfffd) {
    label = "无效替代字符";
  } else if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    label = "无效 Unicode 字符";
  } else if (
    (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
    (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
    (codePoint >= 0x100000 && codePoint <= 0x10fffd)
  ) {
    label = "私用字形";
  } else if (
    (codePoint >= 0x1f000 && codePoint <= 0x1faff) ||
    (codePoint >= 0x1fc00 && codePoint <= 0x1ffff)
  ) {
    label = "表情或图标字符";
  }

  return label
    ? {
        character,
        codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
        label,
      }
    : null;
}

export function unsupportedResumeCharacters(
  value: string,
): UnsupportedResumeCharacter[] {
  const unique = new Map<string, UnsupportedResumeCharacter>();
  for (const character of value) {
    const issue = characterIssue(character);
    if (issue) unique.set(issue.codePoint, issue);
  }
  return [...unique.values()];
}

const OMITTABLE_EXPORT_CHARACTER_LABELS = new Set([
  "不可见控制字符",
  "不可见格式字符",
  "私用字形",
  "表情或图标字符",
]);

export function normalizeResumeTextForExport(value: string): string {
  return Array.from(value, (character) => {
    const issue = characterIssue(character);
    return issue && OMITTABLE_EXPORT_CHARACTER_LABELS.has(issue.label)
      ? " "
      : character;
  })
    .join("")
    .replace(/[\t\u00a0 ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function resumeTextSafetyError(value: string): string | null {
  const issues = unsupportedResumeCharacters(value);
  if (issues.length === 0) return null;
  const summary = issues
    .slice(0, 3)
    .map((issue) => `${issue.label} ${issue.codePoint}`)
    .join("、");
  return `文本包含不支持导出的字符：${summary}。请改用普通文字或常规标点。`;
}
