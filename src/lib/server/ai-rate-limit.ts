import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { isProviderGatewayConfigured } from "./ai/provider-gateway";

export type AiRateLimitKind = "analysis" | "chat" | "jd" | "interview";

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}>;

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number, now: number): Promise<RateLimitDecision>;
}

type Bucket = { count: number; resetAt: number };

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  async consume(key: string, limit: number, windowMs: number, now: number): Promise<RateLimitDecision> {
    const existing = this.buckets.get(key);
    const bucket = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : existing;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10_000) {
      for (const [candidateKey, candidate] of this.buckets) {
        if (candidate.resetAt <= now) this.buckets.delete(candidateKey);
      }
    }
    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}

export class AiRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("请求过于频繁，请稍后重试。");
    this.name = "AiRateLimitError";
  }
}

const DEFAULT_LIMITS: Record<AiRateLimitKind, number> = {
  analysis: 10,
  chat: 60,
  jd: 20,
  interview: 60,
};

const limitEnvironmentNames: Record<AiRateLimitKind, string> = {
  analysis: "AI_RATE_LIMIT_ANALYSIS_PER_HOUR",
  chat: "AI_RATE_LIMIT_CHAT_PER_HOUR",
  jd: "AI_RATE_LIMIT_JD_PER_HOUR",
  interview: "AI_RATE_LIMIT_INTERVIEW_PER_HOUR",
};

type ProviderEnvironment = Readonly<Record<string, string | undefined>>;

function configuredLimit(kind: AiRateLimitKind, environment: ProviderEnvironment): number {
  const parsed = Number(environment[limitEnvironmentNames[kind]] ?? DEFAULT_LIMITS[kind]);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 10_000 ? parsed : DEFAULT_LIMITS[kind];
}

function cookieSession(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("resume-assistant-session="))
    ?.slice("resume-assistant-session=".length);
}

function sessionIdentity(request: Request): string {
  // Client-controlled headers are deliberately ignored. A rotating header must
  // never reset either the session or the independent IP bucket.
  const candidate = cookieSession(request);
  if (candidate && /^[a-zA-Z0-9_-]{16,128}$/.test(candidate)) return candidate;
  const userAgent = request.headers.get("user-agent") ?? "unknown-agent";
  return `anonymous-${createHash("sha256").update(userAgent).digest("hex").slice(0, 24)}`;
}

function trustedProxyIp(request: Request, environment: ProviderEnvironment): string {
  if (environment.TRUST_PROXY_HEADERS !== "true") return "direct";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && isIP(forwarded)) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && isIP(realIp) ? realIp : "unknown";
}

function identityDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function combineDecisions(decisions: readonly RateLimitDecision[]): RateLimitDecision {
  const blocked = decisions.filter((decision) => !decision.allowed);
  return {
    allowed: blocked.length === 0,
    limit: Math.min(...decisions.map((decision) => decision.limit)),
    remaining: Math.min(...decisions.map((decision) => decision.remaining)),
    resetAt: Math.max(...(blocked.length ? blocked : decisions).map((decision) => decision.resetAt)),
  };
}

export async function checkAiRateLimit(
  request: Request,
  kind: AiRateLimitKind,
  options: {
    environment?: ProviderEnvironment;
    store: RateLimitStore;
    now?: number;
  },
): Promise<RateLimitDecision> {
  const environment = options.environment ?? process.env;
  const limit = configuredLimit(kind, environment);
  const now = options.now ?? Date.now();
  const sessionKey = `ai:${kind}:session:${identityDigest(sessionIdentity(request))}`;
  const ipKey = `ai:${kind}:ip:${identityDigest(trustedProxyIp(request, environment))}`;
  const decisions = await Promise.all([
    options.store.consume(sessionKey, limit, 60 * 60 * 1_000, now),
    options.store.consume(ipKey, limit, 60 * 60 * 1_000, now),
  ]);
  return combineDecisions(decisions);
}

const productionStore = new InMemoryRateLimitStore();

export async function enforceAiRateLimit(
  request: Request,
  kind: AiRateLimitKind,
  environment: ProviderEnvironment = process.env,
): Promise<void> {
  if (!isProviderGatewayConfigured(environment)) return;
  const decision = await checkAiRateLimit(request, kind, { environment, store: productionStore });
  if (!decision.allowed) {
    console.warn("ai_rate_limit_rejected", {
      kind,
      retryAfterSeconds: Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1_000)),
    });
    throw new AiRateLimitError(Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1_000)));
  }
}
