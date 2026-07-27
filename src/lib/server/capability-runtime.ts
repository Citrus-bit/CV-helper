import "server-only";

import {
  CapabilityInvocationError,
  type Capability,
  type CapabilityContext,
  type CapabilityResult,
  type ProviderGatewayCapabilityId,
} from "@/lib/capabilities";
import type {
  BaselineCapabilityId,
  BaselineCapabilityInputMap,
  BaselineCapabilityOutputMap,
} from "@/lib/baseline/contracts";
import { createDefaultCapabilityRegistry } from "@/lib/baseline/default-registry";

import {
  OpenAiCompatibleGateway,
  ProviderGatewayError,
  ProviderGatewayConfigurationError,
  loadProviderGatewayConfig,
  type ProviderGatewayLogger,
} from "./ai/provider-gateway";
import {
  AiAnalysisUnavailableError,
  type AiAnalysisFailureReason,
} from "./ai/required-ai";
import {
  createProviderGatewayCapabilities,
  PROVIDER_GATEWAY_MANIFEST,
} from "./ai/provider-capabilities";

type ProviderEnvironment = Readonly<Record<string, string | undefined>>;

export type ServerCapabilityRegistryOptions = {
  environment?: ProviderEnvironment;
  fetchImpl?: typeof fetch;
  logger?: ProviderGatewayLogger;
};

export function createServerCapabilityRegistry(options: ServerCapabilityRegistryOptions = {}) {
  const config = loadProviderGatewayConfig(options.environment ?? process.env);
  if (!config) return createDefaultCapabilityRegistry();
  const registry = createDefaultCapabilityRegistry({ extensionMode: "provider_gateway" });
  const gateway = new OpenAiCompatibleGateway(config, options.fetchImpl, options.logger);
  for (const capability of createProviderGatewayCapabilities(gateway)) {
    registry.registerExtension(
      capability as Capability<unknown, unknown>,
      PROVIDER_GATEWAY_MANIFEST,
    );
  }
  return registry;
}

function createDefaultServerRegistry() {
  try {
    return createServerCapabilityRegistry();
  } catch (error) {
    console.error("ai_provider_gateway_configuration_error", {
      code: error instanceof ProviderGatewayConfigurationError ? error.code : "UNKNOWN",
    });
    return createDefaultCapabilityRegistry();
  }
}

export const serverCapabilityRegistry = createDefaultServerRegistry();

export function invokeCapability<K extends BaselineCapabilityId>(
  id: K,
  input: BaselineCapabilityInputMap[K],
  context: CapabilityContext,
): Promise<CapabilityResult<BaselineCapabilityOutputMap[K]>> {
  return serverCapabilityRegistry.invoke<
    BaselineCapabilityInputMap[K],
    BaselineCapabilityOutputMap[K]
  >(id, input, context);
}

function aiFailureReason(error: unknown): AiAnalysisFailureReason {
  if (error instanceof CapabilityInvocationError) {
    if (error.code === "UNAVAILABLE") return "not_configured";
    if (error.code === "TIMEOUT") return "timeout";
    if (error.code === "INVALID_OUTPUT") return "invalid_response";
    const cause = error.cause;
    if (cause instanceof ProviderGatewayError) {
      if (cause.code === "INVALID_RESPONSE") return "invalid_response";
      if (cause.status === 429) return "rate_limited";
    }
  }
  return "provider_error";
}

function aiFailureRetryable(error: unknown, reason: AiAnalysisFailureReason) {
  if (reason === "not_configured") return false;
  if (error instanceof CapabilityInvocationError) {
    const cause = error.cause;
    if (
      cause instanceof ProviderGatewayError &&
      cause.status !== undefined &&
      [400, 401, 402, 403, 404, 422].includes(cause.status)
    ) {
      return false;
    }
  }
  return true;
}

export function isEnhancedAiSourceVersion(
  capabilityId: ProviderGatewayCapabilityId,
  sourceVersion: string,
) {
  const escapedId = capabilityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sourceVersion.match(new RegExp(`^${escapedId}@(\\d+)\\.`));
  return Number(match?.[1] ?? 0) >= 2;
}

export async function invokeRequiredAiCapability<
  K extends ProviderGatewayCapabilityId & BaselineCapabilityId,
>(
  id: K,
  input: BaselineCapabilityInputMap[K],
  context: CapabilityContext,
): Promise<CapabilityResult<BaselineCapabilityOutputMap[K]>> {
  try {
    const result = await serverCapabilityRegistry.invoke<
      BaselineCapabilityInputMap[K],
      BaselineCapabilityOutputMap[K]
    >(id, input, context, { fallbackPolicy: "forbid" });
    if (
      result.usedFallback ||
      !isEnhancedAiSourceVersion(id, result.sourceVersion)
    ) {
      throw new AiAnalysisUnavailableError(
        id,
        "invalid_response",
        true,
      );
    }
    return result;
  } catch (error) {
    if (
      error instanceof CapabilityInvocationError &&
      error.code === "CANCELLED"
    ) {
      throw error;
    }
    if (error instanceof AiAnalysisUnavailableError) throw error;
    const reason = aiFailureReason(error);
    throw new AiAnalysisUnavailableError(
      id,
      reason,
      aiFailureRetryable(error, reason),
      reason === "timeout" ? 504 : 503,
      { cause: error },
    );
  }
}
