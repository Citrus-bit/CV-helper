import { describe, expect, it } from "vitest";

import {
  exportBlockingCheckIds,
  normalizeExportCheckSeverity,
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
        id: "page-count-change",
        label: "原版页数对照",
        status: "warn" as const,
        details: "新版增加一页。",
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
});
