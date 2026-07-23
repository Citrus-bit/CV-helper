import type { BoundingBox, SourceBlock } from "@/lib/domain";
import type { ParsedPageSource } from "@/lib/server/pdf";

const MAX_NATIVE_COVERAGE = 0.45;
const NEARBY_PADDING = 0.012;
const DUPLICATE_SIMILARITY = 0.82;

type Rectangle = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function normalizedRectangle(box: BoundingBox): Rectangle | undefined {
  const left = Math.max(0, Math.min(1, box.x));
  const top = Math.max(0, Math.min(1, box.y));
  const right = Math.max(left, Math.min(1, box.x + box.width));
  const bottom = Math.max(top, Math.min(1, box.y + box.height));
  if (right <= left || bottom <= top) return undefined;
  return { left, top, right, bottom };
}

function intersection(left: Rectangle, right: Rectangle): Rectangle | undefined {
  const overlap = {
    left: Math.max(left.left, right.left),
    top: Math.max(left.top, right.top),
    right: Math.min(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom),
  };
  if (overlap.right <= overlap.left || overlap.bottom <= overlap.top) return undefined;
  return overlap;
}

function expand(rectangle: Rectangle, padding: number): Rectangle {
  return {
    left: Math.max(0, rectangle.left - padding),
    top: Math.max(0, rectangle.top - padding),
    right: Math.min(1, rectangle.right + padding),
    bottom: Math.min(1, rectangle.bottom + padding),
  };
}

function rectangleUnionArea(rectangles: readonly Rectangle[]): number {
  const boundaries = [...new Set(rectangles.flatMap((rectangle) => [rectangle.left, rectangle.right]))].sort(
    (left, right) => left - right,
  );
  let area = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const left = boundaries[index];
    const right = boundaries[index + 1];
    if (right <= left) continue;
    const intervals = rectangles
      .filter((rectangle) => rectangle.left < right && rectangle.right > left)
      .map((rectangle) => [rectangle.top, rectangle.bottom] as const)
      .sort(([leftTop], [rightTop]) => leftTop - rightTop);
    let coveredHeight = 0;
    let activeTop: number | undefined;
    let activeBottom = 0;
    for (const [top, bottom] of intervals) {
      if (activeTop === undefined) {
        activeTop = top;
        activeBottom = bottom;
      } else if (top <= activeBottom) {
        activeBottom = Math.max(activeBottom, bottom);
      } else {
        coveredHeight += activeBottom - activeTop;
        activeTop = top;
        activeBottom = bottom;
      }
    }
    if (activeTop !== undefined) coveredHeight += activeBottom - activeTop;
    area += (right - left) * coveredHeight;
  }
  return area;
}

function nativeCoverageRatio(ocrBox: BoundingBox, nativeBoxes: readonly BoundingBox[]): number {
  const ocr = normalizedRectangle(ocrBox);
  if (!ocr) return 1;
  const overlaps = nativeBoxes
    .map(normalizedRectangle)
    .filter((box): box is Rectangle => Boolean(box))
    .map((box) => intersection(ocr, box))
    .filter((box): box is Rectangle => Boolean(box));
  const ocrArea = (ocr.right - ocr.left) * (ocr.bottom - ocr.top);
  return Math.min(1, rectangleUnionArea(overlaps) / ocrArea);
}

function compactText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(text: string): Map<string, number> {
  const characters = Array.from(text);
  const result = new Map<string, number>();
  for (let index = 0; index < characters.length - 1; index += 1) {
    const value = `${characters[index]}${characters[index + 1]}`;
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return result;
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  let shared = 0;
  for (const [value, count] of leftBigrams) {
    shared += Math.min(count, rightBigrams.get(value) ?? 0);
  }
  const leftCount = [...leftBigrams.values()].reduce((total, count) => total + count, 0);
  const rightCount = [...rightBigrams.values()].reduce((total, count) => total + count, 0);
  return (2 * shared) / (leftCount + rightCount);
}

function isDuplicateText(text: string, references: readonly string[]): boolean {
  const candidate = compactText(text);
  if (!candidate) return true;
  return references.some((reference) => {
    const existing = compactText(reference);
    if (!existing) return false;
    if (candidate === existing) return true;
    if (candidate.length >= 4 && existing.includes(candidate)) return true;
    const lengthRatio = Math.min(candidate.length, existing.length) / Math.max(candidate.length, existing.length);
    return lengthRatio >= 0.8 && diceSimilarity(candidate, existing) >= DUPLICATE_SIMILARITY;
  });
}

function nearbyNativeBlocks(ocrBlock: SourceBlock, nativeBlocks: readonly SourceBlock[]): SourceBlock[] {
  const ocr = normalizedRectangle(ocrBlock.bbox);
  if (!ocr) return [];
  return nativeBlocks.filter((nativeBlock) => {
    if (nativeBlock.pageIndex !== ocrBlock.pageIndex) return false;
    const native = normalizedRectangle(nativeBlock.bbox);
    return native ? Boolean(intersection(ocr, expand(native, NEARBY_PADDING))) : false;
  });
}

function removeDuplicateLines(text: string, references: readonly string[]): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.filter((line) => !isDuplicateText(line, references)).join("\n");
}

/** Selects OCR evidence without allowing a mixed page's full-page pass to duplicate its native text layer. */
export function selectOcrBlocksForPage(
  pageSource: ParsedPageSource,
  nativeBlocks: readonly SourceBlock[],
  ocrBlocks: readonly SourceBlock[],
): SourceBlock[] {
  const usableOcrBlocks = ocrBlocks.filter((block) => block.source === "ocr" && block.text.trim().length > 0);
  if (pageSource === "scan") return usableOcrBlocks.slice();
  if (pageSource !== "mixed") return [];

  const accepted: SourceBlock[] = [];
  for (const block of usableOcrBlocks) {
    const samePageNative = nativeBlocks.filter((nativeBlock) => nativeBlock.pageIndex === block.pageIndex);
    const nearbyText = nearbyNativeBlocks(block, samePageNative).map((nativeBlock) => nativeBlock.text);
    const text = removeDuplicateLines(block.text, nearbyText);
    if (!text) continue;
    if (nativeCoverageRatio(block.bbox, samePageNative.map((nativeBlock) => nativeBlock.bbox)) >= MAX_NATIVE_COVERAGE) {
      continue;
    }
    accepted.push(text === block.text ? block : { ...block, text });
  }
  return accepted;
}
