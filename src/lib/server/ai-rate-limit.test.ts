import { describe, expect, it } from "vitest";

import { checkAiRateLimit, InMemoryRateLimitStore } from "./ai-rate-limit";

function request(options: {
  headerSession?: string;
  cookieSession?: string;
  ip?: string;
  userAgent?: string;
} = {}) {
  const headers: Record<string, string> = {
    "x-forwarded-for": options.ip ?? "203.0.113.10",
    "user-agent": options.userAgent ?? "rate-limit-test",
  };
  if (options.headerSession) headers["x-resume-session"] = options.headerSession;
  if (options.cookieSession) headers.cookie = `resume-assistant-session=${options.cookieSession}`;
  return new Request("https://app.example/api/analyze", {
    headers,
  });
}

describe("AI rate limiter", () => {
  it("uses the production defaults for analysis, JD, and interview windows", async () => {
    const environment = { TRUST_PROXY_HEADERS: "true" };
    const cases = [
      ["analysis", 10],
      ["jd", 20],
      ["interview", 60],
    ] as const;
    for (const [kind, limit] of cases) {
      const store = new InMemoryRateLimitStore();
      let decision;
      for (let index = 0; index < limit; index += 1) {
        decision = await checkAiRateLimit(request({ cookieSession: `session-${kind}-1234567890` }), kind, {
          environment,
          store,
          now: 1_000,
        });
      }
      expect(decision).toMatchObject({ allowed: true, limit, remaining: 0 });
      await expect(
        checkAiRateLimit(request({ cookieSession: `session-${kind}-1234567890` }), kind, {
          environment,
          store,
          now: 1_001,
        }),
      ).resolves.toMatchObject({ allowed: false, limit, remaining: 0 });
    }
  });

  it("ignores rotating client session headers and enforces an independent IP bucket", async () => {
    const rotatingHeaderStore = new InMemoryRateLimitStore();
    const environment = {
      TRUST_PROXY_HEADERS: "true",
      AI_RATE_LIMIT_ANALYSIS_PER_HOUR: "1",
    };
    const first = await checkAiRateLimit(request({ headerSession: "session-header-12345678" }), "analysis", {
      environment,
      store: rotatingHeaderStore,
      now: 5_000,
    });
    const rotatedHeader = await checkAiRateLimit(request({ headerSession: "session-header-87654321" }), "analysis", {
      environment,
      store: rotatingHeaderStore,
      now: 5_001,
    });
    expect(first.allowed).toBe(true);
    expect(rotatedHeader.allowed).toBe(false);

    const ipStore = new InMemoryRateLimitStore();
    await checkAiRateLimit(request({ cookieSession: "session-cookie-123456", ip: "203.0.113.10" }), "analysis", {
      environment,
      store: ipStore,
      now: 5_002,
    });
    const rotatedCookie = await checkAiRateLimit(request({ cookieSession: "session-cookie-654321", ip: "203.0.113.10" }), "analysis", {
      environment,
      store: ipStore,
      now: 5_003,
    });
    expect(rotatedCookie.allowed).toBe(false);
  });

  it("enforces the session bucket even when the trusted proxy IP changes", async () => {
    const store = new InMemoryRateLimitStore();
    const environment = {
      TRUST_PROXY_HEADERS: "true",
      AI_RATE_LIMIT_ANALYSIS_PER_HOUR: "1",
    };
    await checkAiRateLimit(request({ cookieSession: "session-cookie-123456", ip: "203.0.113.10" }), "analysis", {
      environment,
      store,
      now: 6_000,
    });
    const changedIp = await checkAiRateLimit(request({ cookieSession: "session-cookie-123456", ip: "203.0.113.11" }), "analysis", {
      environment,
      store,
      now: 6_001,
    });
    expect(changedIp.allowed).toBe(false);
  });
});
