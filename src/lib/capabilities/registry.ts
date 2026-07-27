import { z } from "zod";

import { CAPABILITY_CATALOG } from "./catalog";
import {
  capabilityExecutionSchema,
  CapabilityContextSchema,
  CapabilityDescriptorSchema,
  CapabilityInvocationError,
  PROVIDER_GATEWAY_CAPABILITY_IDS,
  SkillManifestSchema,
  type Capability,
  type CapabilityContext,
  type CapabilityExecution,
  type CapabilityId,
  type CapabilityResult,
  type FeatureAvailability,
  type SkillManifest,
} from "./types";

type UnknownCapability = Capability<unknown, unknown>;
type ExtensionRegistration = { capability: UnknownCapability; manifest: SkillManifest };
export type CapabilityRegistryOptions = {
  extensionMode?: "disabled" | "trusted_local" | "provider_gateway";
};

export type FallbackPolicy = "allow" | "forbid";

export type CapabilityInvocationOptions = {
  fallbackPolicy?: FallbackPolicy;
};

const providerGatewayCapabilityIds = new Set<CapabilityId>(PROVIDER_GATEWAY_CAPABILITY_IDS);
const MAX_FALLBACK_RESERVE_MS = 2_000;
const MIN_FALLBACK_RESERVE_MS = 50;

function asUnknownCapability<I, O>(capability: Capability<I, O>): UnknownCapability {
  return capability as unknown as UnknownCapability;
}

function errorCode(error: unknown): CapabilityInvocationError["code"] {
  if (error instanceof CapabilityInvocationError) return error.code;
  if (error instanceof z.ZodError) return "INVALID_OUTPUT";
  return "EXECUTION_FAILED";
}

export class CapabilityRegistry {
  private readonly baselines = new Map<CapabilityId, UnknownCapability>();
  private readonly extensions = new Map<CapabilityId, ExtensionRegistration>();

  constructor(private readonly options: CapabilityRegistryOptions = {}) {}

  registerBaseline<I, O>(capability: Capability<I, O>): this {
    this.assertDescriptor(capability.descriptor, "baseline");
    if (capability.descriptor.provenance !== "builtin") {
      throw new Error(`Baseline ${capability.descriptor.id} must use builtin provenance.`);
    }
    this.baselines.set(capability.descriptor.id, asUnknownCapability(capability));
    return this;
  }

  registerExtension<I, O>(capability: Capability<I, O>, manifestInput: SkillManifest): this {
    const extensionMode = this.options.extensionMode ?? "disabled";
    if (extensionMode === "disabled") {
      throw new Error("Extension execution is disabled until an approved isolated provider gateway is configured.");
    }
    const manifest = SkillManifestSchema.parse(manifestInput);
    this.assertDescriptor(capability.descriptor, extensionMode);
    if (extensionMode === "trusted_local" && capability.descriptor.networkPolicy !== "none") {
      throw new Error("Trusted local extensions cannot request network access.");
    }
    if (
      extensionMode === "provider_gateway" &&
      (!providerGatewayCapabilityIds.has(capability.descriptor.id) || capability.descriptor.networkPolicy !== "provider_only")
    ) {
      throw new Error("Provider gateway extensions must use provider_only network access and a statically approved capability ID.");
    }
    const baseline = this.baselines.get(capability.descriptor.id);
    if (!baseline) {
      throw new Error(`Extension ${capability.descriptor.id} requires a registered baseline fallback.`);
    }
    if (
      JSON.stringify(z.toJSONSchema(capability.inputSchema)) !== JSON.stringify(z.toJSONSchema(baseline.inputSchema)) ||
      JSON.stringify(z.toJSONSchema(capability.outputSchema)) !== JSON.stringify(z.toJSONSchema(baseline.outputSchema))
    ) {
      throw new Error(`Extension ${capability.descriptor.id} must use the canonical baseline schemas.`);
    }
    if (!manifest.capabilities.includes(capability.descriptor.id)) {
      throw new Error(`${manifest.id} does not declare ${capability.descriptor.id}.`);
    }
    if (manifest.contractVersion !== capability.descriptor.contractVersion) {
      throw new Error(`Contract version mismatch for ${capability.descriptor.id}.`);
    }
    if (manifest.networkPolicy !== capability.descriptor.networkPolicy) {
      throw new Error(`Network policy mismatch for ${capability.descriptor.id}.`);
    }
    const excessScopes = capability.descriptor.dataScopes.filter((scope) => !manifest.dataScopes.includes(scope));
    if (excessScopes.length) {
      throw new Error(`${manifest.id} is missing declared data scopes: ${excessScopes.join(", ")}.`);
    }
    this.extensions.set(capability.descriptor.id, { capability: asUnknownCapability(capability), manifest });
    return this;
  }

  removeExtension(id: CapabilityId): boolean {
    return this.extensions.delete(id);
  }

  async invoke<I, O>(
    id: CapabilityId,
    input: I,
    contextInput: CapabilityContext,
    invocationOptions: CapabilityInvocationOptions = {},
  ): Promise<CapabilityResult<O>> {
    const parsedContext = CapabilityContextSchema.safeParse(contextInput);
    if (!parsedContext.success) {
      throw new CapabilityInvocationError(id, "INVALID_CONTEXT", parsedContext.error.message);
    }
    const context: CapabilityContext = { ...parsedContext.data, signal: contextInput.signal };
    const extension = this.extensions.get(id)?.capability;
    const baseline = this.baselines.get(id);
    const fallbackPolicy = invocationOptions.fallbackPolicy ?? "allow";
    const primary = fallbackPolicy === "forbid" ? extension : extension ?? baseline;
    if (!primary) {
      throw new CapabilityInvocationError(
        id,
        "UNAVAILABLE",
        fallbackPolicy === "forbid"
          ? `${id} enhanced provider is not available.`
          : `${id} is not available.`,
      );
    }
    this.assertScopes(id, primary, context);

    if (
      fallbackPolicy === "allow" &&
      extension &&
      baseline &&
      this.shouldSkipExtensionForDeadline(context)
    ) {
      this.assertScopes(id, baseline, context);
      const fallbackResult = (await this.run(baseline, input, context, true)) as CapabilityResult<O>;
      return {
        ...fallbackResult,
        warnings: [
          {
            code: "EXTENSION_SKIPPED_DEADLINE",
            message: "剩余处理时间不足，已直接使用内置基线。",
          },
          ...fallbackResult.warnings,
        ],
      };
    }

    try {
      const primaryContext =
        fallbackPolicy === "allow" && extension
          ? this.reserveFallbackDeadline(context)
          : context;
      return (await this.run(primary, input, primaryContext, false)) as CapabilityResult<O>;
    } catch (primaryError) {
      if (primaryError instanceof CapabilityInvocationError && primaryError.code === "CANCELLED") {
        throw primaryError;
      }
      if (fallbackPolicy === "forbid" || !extension || !baseline)
        throw primaryError;
      this.assertScopes(id, baseline, context);
      const fallbackResult = (await this.run(baseline, input, context, true)) as CapabilityResult<O>;
      return {
        ...fallbackResult,
        warnings: [
          {
            code: `EXTENSION_${errorCode(primaryError)}`,
            message: `增强能力未能完成，已使用内置基线：${
              primaryError instanceof Error ? primaryError.message : "unknown error"
            }`,
          },
          ...fallbackResult.warnings,
        ],
      };
    }
  }

  private shouldSkipExtensionForDeadline(context: CapabilityContext): boolean {
    return Date.parse(context.deadlineAt) - Date.now() <= MIN_FALLBACK_RESERVE_MS * 2;
  }

  private reserveFallbackDeadline(context: CapabilityContext): CapabilityContext {
    const deadline = Date.parse(context.deadlineAt);
    const remaining = Math.max(1, deadline - Date.now());
    const reserve = Math.min(
      MAX_FALLBACK_RESERVE_MS,
      Math.max(MIN_FALLBACK_RESERVE_MS, Math.floor(remaining * 0.2)),
      Math.max(1, remaining - 1),
    );
    return {
      ...context,
      deadlineAt: new Date(deadline - reserve).toISOString(),
    };
  }

  getFeatureAvailability(): FeatureAvailability[] {
    return [...CAPABILITY_CATALOG.keys()].map((id) => {
      const fallbackAvailable = this.baselines.has(id);
      const enhanced = this.extensions.has(id);
      const descriptor = CAPABILITY_CATALOG.get(id)!;
      return {
        id,
        available: enhanced || fallbackAvailable,
        mode: enhanced ? "enhanced" : fallbackAvailable ? "baseline" : "unavailable",
        locales: descriptor.locales,
        fallbackAvailable,
      };
    });
  }

  describe(id: CapabilityId) {
    const capability = this.extensions.get(id)?.capability ?? this.baselines.get(id);
    const descriptor = CAPABILITY_CATALOG.get(id)!;
    return {
      descriptor,
      available: Boolean(capability),
      inputJsonSchema: capability ? z.toJSONSchema(capability.inputSchema) : undefined,
      outputJsonSchema: capability ? z.toJSONSchema(capability.outputSchema) : undefined,
    };
  }

  private assertDescriptor(
    descriptorInput: unknown,
    registration: "baseline" | "trusted_local" | "provider_gateway",
  ): asserts descriptorInput is import("./types").CapabilityDescriptor {
    const descriptor = CapabilityDescriptorSchema.parse(descriptorInput);
    const allowed = CAPABILITY_CATALOG.get(descriptor.id);
    if (!allowed) throw new Error(`Capability ${descriptor.id} is not in the static whitelist.`);
    if (descriptor.contractVersion !== allowed.contractVersion) {
      throw new Error(`Unsupported contract version for ${descriptor.id}.`);
    }
    const expectedNetworkPolicy = registration === "provider_gateway" ? "provider_only" : allowed.networkPolicy;
    if (descriptor.networkPolicy !== expectedNetworkPolicy) {
      throw new Error(`Network policy for ${descriptor.id} must match the static catalog.`);
    }
    const excessScopes = descriptor.dataScopes.filter((scope) => !allowed.dataScopes.includes(scope));
    if (excessScopes.length) {
      throw new Error(`Capability ${descriptor.id} requests data scopes outside the static catalog: ${excessScopes.join(", ")}.`);
    }
    const excessLocales = descriptor.locales.filter((locale) => !allowed.locales.includes(locale));
    if (excessLocales.length) {
      throw new Error(`Capability ${descriptor.id} declares unsupported locales: ${excessLocales.join(", ")}.`);
    }
    if (descriptor.timeoutMs > allowed.timeoutMs) {
      throw new Error(`Capability ${descriptor.id} exceeds the static timeout ceiling.`);
    }
  }

  private assertScopes(id: CapabilityId, capability: UnknownCapability, context: CapabilityContext): void {
    const denied = capability.descriptor.dataScopes.filter((scope) => !context.grantedDataScopes.includes(scope));
    if (denied.length) {
      throw new CapabilityInvocationError(id, "DATA_SCOPE_DENIED", `Missing data scopes: ${denied.join(", ")}.`);
    }
  }

  private async run(
    capability: UnknownCapability,
    rawInput: unknown,
    context: CapabilityContext,
    usedFallback: boolean,
  ): Promise<CapabilityResult<unknown>> {
    const { id, timeoutMs, version } = capability.descriptor;
    const parsedInput = capability.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new CapabilityInvocationError(id, "INVALID_INPUT", parsedInput.error.message);
    }

    const deadlineRemaining = Date.parse(context.deadlineAt) - Date.now();
    if (deadlineRemaining <= 0) {
      throw new CapabilityInvocationError(id, "TIMEOUT", `${id} deadline has passed.`);
    }
    const effectiveTimeout = Math.max(1, Math.min(timeoutMs, deadlineRemaining));
    const controller = new AbortController();
    let rejectCancellation: ((reason: CapabilityInvocationError) => void) | undefined;
    const abortFromParent = () => {
      controller.abort(context.signal?.reason);
      rejectCancellation?.(new CapabilityInvocationError(id, "CANCELLED", `${id} was cancelled.`));
    };
    if (context.signal?.aborted) {
      throw new CapabilityInvocationError(id, "CANCELLED", `${id} was cancelled.`);
    }
    context.signal?.addEventListener("abort", abortFromParent, { once: true });
    const startedAt = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error("Capability timed out"));
          reject(new CapabilityInvocationError(id, "TIMEOUT", `${id} exceeded ${effectiveTimeout}ms.`));
        }, effectiveTimeout);
      });
      const cancellation = new Promise<never>((_, reject) => {
        rejectCancellation = reject;
      });
      const execution = await Promise.race([
        Promise.resolve(
          capability.execute(parsedInput.data, {
            ...context,
            signal: controller.signal,
          }),
        ),
        timeout,
        cancellation,
      ]);
      const parsedExecution = capabilityExecutionSchema(capability.outputSchema).safeParse(execution);
      if (!parsedExecution.success) {
        throw new CapabilityInvocationError(id, "INVALID_OUTPUT", parsedExecution.error.message);
      }
      const result = parsedExecution.data as CapabilityExecution<unknown>;
      return {
        data: result.data,
        confidence: result.confidence ?? 0.7,
        evidenceReferences: [...new Set(result.evidenceReferences ?? [])],
        warnings: result.warnings ?? [],
        sourceVersion: `${id}@${version}`,
        durationMs: Math.max(0, performance.now() - startedAt),
        usage: result.usage,
        usedFallback,
      };
    } catch (error) {
      if (context.signal?.aborted) {
        throw new CapabilityInvocationError(id, "CANCELLED", `${id} was cancelled.`, { cause: error });
      }
      if (error instanceof CapabilityInvocationError) throw error;
      throw new CapabilityInvocationError(id, "EXECUTION_FAILED", `${id} failed.`, { cause: error });
    } finally {
      if (timer) clearTimeout(timer);
      context.signal?.removeEventListener("abort", abortFromParent);
    }
  }
}
