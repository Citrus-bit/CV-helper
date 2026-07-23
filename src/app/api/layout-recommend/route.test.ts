import { describe, expect, it } from "vitest";

import { POST } from "./route";

const denseResume = {
  schemaVersion: "1.0",
  locale: "zh-CN",
  contact: { name: "候选人", links: [] },
  summary: "产品规划、用户研究、数据分析与跨团队交付。".repeat(140),
  sections: [],
};

describe("POST /api/layout-recommend", () => {
  it("returns a validated template recommendation for a dense resume", async () => {
    const response = await POST(
      new Request("http://localhost/api/layout-recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ast: denseResume, targetPages: 1 }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recommendedTemplate).toBe("compact");
    expect(body.density).toBe("dense");
    expect(body.rankings).toHaveLength(3);
  });

  it("rejects target page counts outside the supported range", async () => {
    const response = await POST(
      new Request("http://localhost/api/layout-recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ast: denseResume, targetPages: 3 }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
