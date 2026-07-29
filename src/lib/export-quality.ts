import type { AuditCheck } from "@/lib/domain";

const BLOCKING_EXPORT_CHECK_IDS = new Set([
  "valid-pdf",
  "visual-content",
  "text-visibility",
  "searchable-text",
  "content-completeness",
  "clipping",
  "overlap",
  "missing-glyphs",
  "sha256",
  "pagination",
]);

export function normalizeExportCheckSeverity(check: AuditCheck): AuditCheck {
  if (
    check.status === "fail" &&
    !BLOCKING_EXPORT_CHECK_IDS.has(check.id)
  ) {
    return { ...check, status: "warn" };
  }
  return check;
}

export function exportBlockingCheckIds(checks: readonly AuditCheck[]) {
  return checks
    .filter(
      (check) =>
        check.status === "fail" && BLOCKING_EXPORT_CHECK_IDS.has(check.id),
    )
    .map((check) => check.id);
}

export function qualityThresholdCheck(overallScore: number): AuditCheck {
  return {
    id: "quality-threshold",
    label: "综合质量提示",
    status: overallScore >= 85 ? "pass" : "warn",
    details:
      overallScore >= 85
        ? "综合质量达到建议标准。"
        : "综合质量低于 85 分，建议调整；当前文件无致命错误时仍可下载。",
  };
}

export function onePagePreferenceCheck(pageCount: number): AuditCheck {
  const isOnePage = pageCount === 1;
  return {
    id: "pagination",
    label: "单页长度",
    status: isOnePage ? "pass" : "fail",
    details: isOnePage
      ? "当前为 1 页，符合 Compact 单页导出要求。"
      : `当前为 ${pageCount} 页，未达到 Compact 单页导出要求；请精简重复内容后重新生成。`,
  };
}
