import { describe, expect, it, vi } from "vitest";

import {
  API_RATE_LIMIT_SESSION_KEY,
  clearApiSessionId,
  clearLegacySession,
  getOrCreateApiSessionId,
  LEGACY_SESSION_KEY,
} from "./privacy";

describe("legacy session cleanup", () => {
  it("removes the old persistent resume key from every application entry state", () => {
    const removeItem = vi.fn();

    clearLegacySession({ removeItem });

    expect(removeItem).toHaveBeenCalledWith(LEGACY_SESSION_KEY);
  });

  it("does not break startup when browser storage is blocked", () => {
    expect(() => clearLegacySession({ removeItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});

describe("anonymous API session", () => {
  it("persists within session storage and rotates after explicit local-data cleanup", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const first = getOrCreateApiSessionId(storage);

    expect(getOrCreateApiSessionId(storage)).toBe(first);
    expect(values.get(API_RATE_LIMIT_SESSION_KEY)).toBe(first);
    clearApiSessionId(storage);
    const rotated = getOrCreateApiSessionId(storage);

    expect(rotated).not.toBe(first);
    expect(values.get(API_RATE_LIMIT_SESSION_KEY)).toBe(rotated);
  });
});
