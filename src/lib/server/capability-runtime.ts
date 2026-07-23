import "server-only";

import type { Capability, CapabilityContext, CapabilityResult } from "@/lib/capabilities";
import type {
  BaselineCapabilityId,
  BaselineCapabilityInputMap,
  BaselineCapabilityOutputMap,
} from "@/lib/baseline/contracts";
import { createDefaultCapabilityRegistry } from "@/lib/baseline/default-registry";

import {
  OpenAiCompatibleGateway,
  ProviderGatewayConfigurationError,
  loadProviderGatewayConfig,
  type ProviderGatewayLogger,
} from "./ai/provider-gateway";
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
