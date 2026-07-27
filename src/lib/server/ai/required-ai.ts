import "server-only";

import type { ProviderGatewayCapabilityId } from "@/lib/capabilities";

export type AiAnalysisFailureReason =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "invalid_response";

export class AiAnalysisUnavailableError extends Error {
  constructor(
    readonly failedCapability: ProviderGatewayCapabilityId,
    readonly reason: AiAnalysisFailureReason,
    readonly retryable: boolean,
    readonly status: 503 | 504 = reason === "timeout" ? 504 : 503,
    options?: ErrorOptions,
  ) {
    super("AI 分析未完成，未返回本地模板结果，请稍后重试。", options);
    this.name = "AiAnalysisUnavailableError";
  }
}
