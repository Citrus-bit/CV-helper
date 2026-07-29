import { describe, expect, it } from "vitest";

import {
  exportBlockingCheckIds,
  normalizeExportCheckSeverity,
  onePagePreferenceCheck,
  qualityThresholdCheck,
} from "./export-quality";

describe("export quality policy", () => {
  it("keeps advisory layout failures downloadable", () => {
    const checks = [
      {
        id: "font-size",
        label: "最小文字尺寸",
        status: "fail" as const,
        details: "存在小字号。",
      },
      {
        id: "pagination",
        label: "分页密度",
        status: "warn" as const,
        details: "当前版本超过两页。",
      },
    ].map(normalizeExportCheckSeverity);

    expect(checks[0]?.status).toBe("warn");
    expect(exportBlockingCheckIds(checks)).toEqual([]);
    expect(qualityThresholdCheck(78)).toMatchObject({
      status: "warn",
      label: "综合质量提示",
    });
  });

  it("still blocks corrupt, incomplete, clipped, or hash-mismatched files", () => {
    const checks = [
      "valid-pdf",
      "content-completeness",
      "clipping",
      "overlap",
      "sha256",
    ].map((id) => ({ id, label: id, status: "fail" as const }));

    expect(exportBlockingCheckIds(checks)).toEqual([
      "valid-pdf",
      "content-completeness",
      "clipping",
      "overlap",
      "sha256",
    ]);
  });

  it("keeps a multi-page Compact export downloadable with a clear warning", () => {
    expect(onePagePreferenceCheck(1)).toEqual({
      id: "pagination",
      label: "页面长度",
      status: "pass",
      details: "当前为 1 页，符合 Compact 单页目标。",
    });

    const longerResume = onePagePreferenceCheck(2);
    expect(longerResume.status).toBe("warn");
    expect(longerResume.details).toContain("不影响下载");
    expect(exportBlockingCheckIds([longerResume])).toEqual([]);
  });
});
