import "server-only";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const ID_NUMBER_PATTERN = /(?<!\d)\d{17}[\dX](?!\d)/giu;
const PHONE_PATTERN = /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)|(?<!\d)(?:\+?\d{1,3}[-\s]?)?(?:\d[-\s]?){7,12}(?!\d)/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>{}\[\]"']+|\bwww\.[^\s<>{}\[\]"']+/giu;
const LABELED_ADDRESS_PATTERN = /(?:地址|住址|现居地|所在地|address|location)\s*[：:]\s*["']?[^\n,，;；"']{2,120}/giu;
const LABELED_NAME_PATTERN = /(?:姓名|名字|full\s+name|candidate\s+name)\s*[：:]\s*["']?(?:[\p{Script=Han}·]{2,12}|[\p{Script=Latin}][\p{Script=Latin}'-]{1,30}(?:\s+[\p{Script=Latin}][\p{Script=Latin}'-]{1,30}){0,2})(?=[,，。.;；!?\n"']|$)/giu;
const CHINESE_SELF_NAME_PATTERN = /我叫\s*[\p{Script=Han}·]{2,12}(?=[,，。.;；!?\s"']|$)/gu;
const ENGLISH_SELF_NAME_PATTERN = /\bmy\s+name\s+is\s+[\p{Script=Latin}][\p{Script=Latin}'-]{1,30}(?:\s+[\p{Script=Latin}][\p{Script=Latin}'-]{1,30}){0,2}(?=[,，。.;；!?\n"']|$)/giu;

export type PiiProjectionHints = Readonly<{
  names?: readonly string[];
  addresses?: readonly string[];
}>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexibleKnownValuePattern(value: string): RegExp | undefined {
  const compact = value.normalize("NFKC").replace(/[\s._-]+/g, "").trim();
  if (compact.length < 2) return undefined;
  const flexible = Array.from(compact).map(escapeRegExp).join("[\\s._-]*");
  const latinOrNumber = /^[\p{Script=Latin}\p{N}]+$/u.test(compact);
  return new RegExp(
    latinOrNumber ? `(?<![\\p{L}\\p{N}])${flexible}(?![\\p{L}\\p{N}])` : flexible,
    "giu",
  );
}

function patternMatches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  const matched = pattern.test(value);
  pattern.lastIndex = 0;
  return matched;
}

export class PiiProjector {
  private readonly namePatterns: readonly RegExp[];
  private readonly addressPatterns: readonly RegExp[];

  constructor(hints: PiiProjectionHints = {}) {
    this.namePatterns = (hints.names ?? [])
      .map(flexibleKnownValuePattern)
      .filter((pattern): pattern is RegExp => Boolean(pattern));
    this.addressPatterns = (hints.addresses ?? [])
      .map(flexibleKnownValuePattern)
      .filter((pattern): pattern is RegExp => Boolean(pattern));
  }

  redact(value: string): string {
    let projected = value
      .normalize("NFKC")
      .replace(EMAIL_PATTERN, "[EMAIL]")
      .replace(ID_NUMBER_PATTERN, "[ID_NUMBER]")
      .replace(PHONE_PATTERN, "[PHONE]")
      .replace(URL_PATTERN, "[LINK]")
      .replace(LABELED_ADDRESS_PATTERN, "[ADDRESS]")
      .replace(LABELED_NAME_PATTERN, "姓名：[NAME]")
      .replace(CHINESE_SELF_NAME_PATTERN, "我叫[NAME]")
      .replace(ENGLISH_SELF_NAME_PATTERN, "my name is [NAME]");
    for (const pattern of this.namePatterns) projected = projected.replace(pattern, "[NAME]");
    for (const pattern of this.addressPatterns) projected = projected.replace(pattern, "[ADDRESS]");
    return projected.trim();
  }

  containsSensitiveValue(value: string): boolean {
    const normalized = value.normalize("NFKC");
    return [
      EMAIL_PATTERN,
      ID_NUMBER_PATTERN,
      PHONE_PATTERN,
      URL_PATTERN,
      LABELED_ADDRESS_PATTERN,
      LABELED_NAME_PATTERN,
      CHINESE_SELF_NAME_PATTERN,
      ENGLISH_SELF_NAME_PATTERN,
    ]
      .some((pattern) => patternMatches(pattern, normalized)) ||
      [...this.namePatterns, ...this.addressPatterns].some((pattern) => patternMatches(pattern, normalized));
  }

  assertSafe(value: unknown): void {
    const serialized = JSON.stringify(value);
    if (this.containsSensitiveValue(serialized)) {
      throw new Error("PII projection invariant failed.");
    }
  }
}
