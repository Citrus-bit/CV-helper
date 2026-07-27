const STOP_WORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "from",
  "that",
  "this",
  "your",
  "you",
  "our",
  "are",
  "will",
  "工作",
  "负责",
  "相关",
  "以及",
  "进行",
  "能够",
  "具备",
  "要求",
  "岗位",
]);

const UNTRUSTED_DOCUMENT_OPEN = "[UNTRUSTED_DOCUMENT_DATA]";
const UNTRUSTED_DOCUMENT_CLOSE = "[/UNTRUSTED_DOCUMENT_DATA]";

export function wrapUntrustedDocumentText(value: string): string {
  return `${UNTRUSTED_DOCUMENT_OPEN}\n${value}\n${UNTRUSTED_DOCUMENT_CLOSE}`;
}

export function unwrapUntrustedDocumentText(value: string): string {
  const prefix = `${UNTRUSTED_DOCUMENT_OPEN}\n`;
  const suffix = `\n${UNTRUSTED_DOCUMENT_CLOSE}`;
  return value.startsWith(prefix) && value.endsWith(suffix)
    ? value.slice(prefix.length, -suffix.length)
    : value;
}

export function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function extractKeywords(value: string): string[] {
  const latin = value.toLowerCase().match(/[a-z][a-z0-9+#.]{1,}/g) ?? [];
  const cjk = value.match(/[\p{Script=Han}]{2,6}/gu) ?? [];
  return [...new Set([...latin, ...cjk].filter((token) => !STOP_WORDS.has(token.toLowerCase())))];
}

export function keywordOverlap(left: string | string[], right: string | string[]): string[] {
  const leftTokens = new Set(Array.isArray(left) ? left.map((value) => value.toLowerCase()) : extractKeywords(left));
  const rightTokens = new Set(Array.isArray(right) ? right.map((value) => value.toLowerCase()) : extractKeywords(right));
  return [...leftTokens].filter((token) => rightTokens.has(token));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, digits = 0): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function numericTokens(value: string): string[] {
  return [...new Set(value.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [])];
}

export function splitStatements(value: string): string[] {
  return value
    .split(/(?:\r?\n|[。；;]|(?<=[.!?])\s+)/)
    .map(normalizeText)
    .filter((line) => line.length >= 4);
}

export function excerpt(value: string, maxLength = 80): string {
  const normalized = normalizeText(value);
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

export function claimParts(text: string) {
  const normalized = normalizeText(text);
  const methodMatch = normalized.match(/(?:通过|采用|使用|利用|基于|using|via|with)\s*([^，,。.;；]+)/i);
  const hasMetric = numericTokens(normalized).length > 0;
  return {
    action: excerpt(normalized, 70),
    method: methodMatch?.[0],
    result: hasMetric ? excerpt(normalized, 100) : undefined,
    missingInformation: [
      ...(methodMatch ? [] : ["具体方法或个人动作"]),
      ...(hasMetric ? [] : ["可核实的结果或影响"]),
    ],
  };
}
