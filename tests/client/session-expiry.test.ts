import { describe, expect, it } from "vitest";

import { hasSessionExpired } from "@/lib/client/store";

describe("anonymous session expiry", () => {
  it("expires at the declared deadline and keeps undated sessions inert", () => {
    const now = Date.parse("2026-07-22T12:00:00.000Z");
    expect(hasSessionExpired(null, now)).toBe(false);
    expect(hasSessionExpired("2026-07-22T12:00:00.000Z", now)).toBe(true);
    expect(hasSessionExpired("2026-07-22T11:59:59.999Z", now)).toBe(true);
    expect(hasSessionExpired("2026-07-22T12:00:00.001Z", now)).toBe(false);
  });
});
