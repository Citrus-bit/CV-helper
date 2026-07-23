import {
  CapabilityRegistry,
  type Capability,
  type CapabilityContext,
  type CapabilityRegistryOptions,
  type CapabilityResult,
} from "@/lib/capabilities";

import { BUILTIN_BASELINE_CAPABILITIES } from "./capabilities";
import type { BaselineCapabilityId, BaselineCapabilityInputMap, BaselineCapabilityOutputMap } from "./contracts";

export function createDefaultCapabilityRegistry(options?: CapabilityRegistryOptions): CapabilityRegistry {
  const registry = new CapabilityRegistry(options);
  for (const capability of BUILTIN_BASELINE_CAPABILITIES) {
    registry.registerBaseline(capability as unknown as Capability<unknown, unknown>);
  }
  return registry;
}

export const defaultCapabilityRegistry = createDefaultCapabilityRegistry();

export function invokeBaselineCapability<K extends BaselineCapabilityId>(
  id: K,
  input: BaselineCapabilityInputMap[K],
  context: CapabilityContext,
): Promise<CapabilityResult<BaselineCapabilityOutputMap[K]>> {
  return defaultCapabilityRegistry.invoke<BaselineCapabilityInputMap[K], BaselineCapabilityOutputMap[K]>(id, input, context);
}
