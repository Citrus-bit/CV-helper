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
