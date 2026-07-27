import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  CapabilityRegistry,
  CapabilityInvocationError,
  getCapabilityDescriptor,
  type Capability,
  type SkillManifest,
} from "@/lib/capabilities";
import {
  ResumeScoreInputSchema,
  ResumeScoreOutputSchema,
  createDefaultCapabilityRegistry,
} from "@/lib/baseline";
import { ResumeDocumentSchema } from "@/lib/domain";

const fullContext = {
  sessionId: "session-registry",
  locale: "zh-CN" as const,
  traceId: "trace-registry",
  deadlineAt: new Date(Date.now() + 10_000).toISOString(),
  grantedDataScopes: ["resume_ast", "evidence_graph"] as const,
};

const minimalResume = ResumeDocumentSchema.parse({
  id: "resume-registry",
  revision: 0,
  originalFileName: "resume.pdf",
  mimeType: "application/pdf",
  locale: "zh-CN",
  pageCount: 1,
  parseMethod: "native",
  sourceBlocks: [],
  ast: { schemaVersion: "1.0", locale: "zh-CN", contact: { name: "候选人", links: [] }, sections: [] },
  parsingWarnings: [],
});

function manifest(): SkillManifest {
  return {
    id: "test.resume.score",
    version: "1.0.0",
    kind: "rule_pack",
    contractVersion: "1.0",
    capabilities: ["resume.score"],
    locales: ["zh-CN"],
    dataScopes: ["resume_ast", "evidence_graph"],
    networkPolicy: "none",
    license: "MIT",
    provenance: "unit-test",
    evalSuiteId: "resume-score-fixture-v1",
  };
}

describe("CapabilityRegistry", () => {
  const registryWithExtensions = () => createDefaultCapabilityRegistry({ extensionMode: "trusted_local" });

  it("keeps extension execution disabled in the production-default registry", () => {
    const extension: Capability<z.infer<typeof ResumeScoreInputSchema>, z.infer<typeof ResumeScoreOutputSchema>> = {
      descriptor: { ...getCapabilityDescriptor("resume.score"), version: "2.0.0", provenance: "unit-test" },
      inputSchema: ResumeScoreInputSchema,
      outputSchema: ResumeScoreOutputSchema,
      execute: () => ({ data: ResumeScoreOutputSchema.parse({}) }),
    };
    expect(() => createDefaultCapabilityRegistry().registerExtension(extension, manifest())).toThrow(/disabled/);
  });

  it("falls back when an extension returns invalid output", async () => {
    const registry = registryWithExtensions();
    const extension: Capability<z.infer<typeof ResumeScoreInputSchema>, z.infer<typeof ResumeScoreOutputSchema>> = {
      descriptor: { ...getCapabilityDescriptor("resume.score"), version: "2.0.0", provenance: "unit-test" },
      inputSchema: ResumeScoreInputSchema,
      outputSchema: ResumeScoreOutputSchema,
      execute: () => ({ data: { total: "invalid" } as unknown as z.infer<typeof ResumeScoreOutputSchema> }),
    };
    registry.registerExtension(extension, manifest());

    const result = await registry.invoke("resume.score", { resume: minimalResume, claims: [] }, fullContext);
    expect(result.usedFallback).toBe(true);
    expect(result.sourceVersion).toBe("resume.score@1.0.0");
    expect(result.warnings[0].code).toBe("EXTENSION_INVALID_OUTPUT");
  });

  it("forbids baseline execution when an enhanced provider is missing", async () => {
    await expect(
      createDefaultCapabilityRegistry().invoke(
        "resume.score",
        { resume: minimalResume, claims: [] },
        fullContext,
        { fallbackPolicy: "forbid" },
      ),
    ).rejects.toMatchObject({
      capabilityId: "resume.score",
      code: "UNAVAILABLE",
    });
  });

  it("forbids baseline execution after an invalid enhanced response", async () => {
    let baselineCalls = 0;
    const registry = new CapabilityRegistry({ extensionMode: "trusted_local" });
    registry.registerBaseline({
      descriptor: {
        ...getCapabilityDescriptor("resume.score"),
        version: "1.0.0",
        provenance: "builtin",
      },
      inputSchema: ResumeScoreInputSchema,
      outputSchema: ResumeScoreOutputSchema,
      execute: () => {
        baselineCalls += 1;
        return { data: ResumeScoreOutputSchema.parse({}) };
      },
    });
    registry.registerExtension(
      {
        descriptor: {
          ...getCapabilityDescriptor("resume.score"),
          version: "2.0.0",
          provenance: "unit-test",
        },
        inputSchema: ResumeScoreInputSchema,
        outputSchema: ResumeScoreOutputSchema,
        execute: () => ({ data: { total: "invalid" } as never }),
      },
      manifest(),
    );

    await expect(
      registry.invoke(
        "resume.score",
        { resume: minimalResume, claims: [] },
        fullContext,
        { fallbackPolicy: "forbid" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(baselineCalls).toBe(0);
  });

  it("forbids baseline execution after an enhanced provider error", async () => {
    const registry = registryWithExtensions();
    registry.registerExtension(
      {
        descriptor: {
          ...getCapabilityDescriptor("resume.score"),
          version: "2.0.0",
          provenance: "unit-test",
        },
        inputSchema: ResumeScoreInputSchema,
        outputSchema: ResumeScoreOutputSchema,
        execute: () => {
          throw new TypeError("provider network unavailable");
        },
      },
      manifest(),
    );

    await expect(
      registry.invoke(
        "resume.score",
        { resume: minimalResume, claims: [] },
        fullContext,
        { fallbackPolicy: "forbid" },
      ),
    ).rejects.toMatchObject({ code: "EXECUTION_FAILED" });
  });

  it("forbids baseline execution after an enhanced provider timeout", async () => {
    const registry = registryWithExtensions();
    registry.registerExtension(
      {
        descriptor: {
          ...getCapabilityDescriptor("resume.score"),
          version: "2.0.0",
          provenance: "unit-test",
          timeoutMs: 2,
        },
        inputSchema: ResumeScoreInputSchema,
        outputSchema: ResumeScoreOutputSchema,
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { data: ResumeScoreOutputSchema.parse({}) };
        },
      },
      manifest(),
    );

    await expect(
      registry.invoke(
        "resume.score",
        { resume: minimalResume, claims: [] },
        fullContext,
        { fallbackPolicy: "forbid" },
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("returns only the enhanced source in forbid mode", async () => {
    const registry = registryWithExtensions();
    registry.registerExtension(
      {
        descriptor: {
          ...getCapabilityDescriptor("resume.score"),
          version: "2.1.0",
          provenance: "unit-test",
        },
        inputSchema: ResumeScoreInputSchema,
        outputSchema: ResumeScoreOutputSchema,
        execute: () => ({
          data: ResumeScoreOutputSchema.parse({
            resumeId: minimalResume.id,
            resumeRevision: minimalResume.revision,
            total: 0,
            dimensions: [
              ["impact", 25],
              ["completeness", 15],
              ["clarity", 15],
              ["structure", 15],
              ["ats", 15],
              ["language", 15],
            ].map(([id, maxScore]) => ({
              id,
              label: id,
              score: 0,
              maxScore,
            })),
            summary: "Enhanced provider fixture.",
          }),
        }),
      },
      manifest(),
    );

    await expect(
      registry.invoke(
        "resume.score",
        { resume: minimalResume, claims: [] },
        fullContext,
        { fallbackPolicy: "forbid" },
      ),
    ).resolves.toMatchObject({
      sourceVersion: "resume.score@2.1.0",
      usedFallback: false,
    });
  });

  it("rejects invalid execution metadata and falls back to the baseline", async () => {
    const registry = registryWithExtensions();
    const extension: Capability<z.infer<typeof ResumeScoreInputSchema>, z.infer<typeof ResumeScoreOutputSchema>> = {
      descriptor: { ...getCapabilityDescriptor("resume.score"), version: "2.0.0", provenance: "unit-test" },
      inputSchema: ResumeScoreInputSchema,
      outputSchema: ResumeScoreOutputSchema,
      execute: () => ({
        data: ResumeScoreOutputSchema.parse({
          resumeId: minimalResume.id,
          resumeRevision: 0,
          total: 0,
          dimensions: [
            { id: "impact", label: "impact", score: 0, maxScore: 25 },
            { id: "completeness", label: "completeness", score: 0, maxScore: 15 },
            { id: "clarity", label: "clarity", score: 0, maxScore: 15 },
            { id: "structure", label: "structure", score: 0, maxScore: 15 },
            { id: "ats", label: "ats", score: 0, maxScore: 15 },
            { id: "language", label: "language", score: 0, maxScore: 15 },
          ],
          summary: "invalid metadata fixture",
        }),
        confidence: 1.5,
        warnings: [{ code: "", message: "invalid" }],
        usage: { inputUnits: -1 },
      } as never),
    };
    registry.registerExtension(extension, manifest());

    const result = await registry.invoke("resume.score", { resume: minimalResume, claims: [] }, fullContext);
    expect(result.usedFallback).toBe(true);
    expect(result.warnings[0].code).toBe("EXTENSION_INVALID_OUTPUT");
  });

  it("falls back when an extension exceeds its timeout", async () => {
    const registry = registryWithExtensions();
    const extension: Capability<z.infer<typeof ResumeScoreInputSchema>, z.infer<typeof ResumeScoreOutputSchema>> = {
      descriptor: { ...getCapabilityDescriptor("resume.score"), version: "2.0.0", provenance: "unit-test", timeoutMs: 2 },
      inputSchema: ResumeScoreInputSchema,
      outputSchema: ResumeScoreOutputSchema,
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { data: ResumeScoreOutputSchema.parse({}) };
      },
    };
    registry.registerExtension(extension, manifest());

    const result = await registry.invoke("resume.score", { resume: minimalResume, claims: [] }, fullContext);
    expect(result.usedFallback).toBe(true);
    expect(result.warnings[0].code).toBe("EXTENSION_TIMEOUT");
  });

  it("skips an extension when only the fallback deadline reserve remains", async () => {
    const registry = registryWithExtensions();
    let extensionCalled = false;
    const extension: Capability<z.infer<typeof ResumeScoreInputSchema>, z.infer<typeof ResumeScoreOutputSchema>> = {
      descriptor: { ...getCapabilityDescriptor("resume.score"), version: "2.0.0", provenance: "unit-test" },
      inputSchema: ResumeScoreInputSchema,
      outputSchema: ResumeScoreOutputSchema,
      execute: () => {
        extensionCalled = true;
        throw new Error("must not run");
      },
    };
    registry.registerExtension(extension, manifest());

    const result = await registry.invoke(
      "resume.score",
      { resume: minimalResume, claims: [] },
      { ...fullContext, deadlineAt: new Date(Date.now() + 90).toISOString() },
    );

    expect(extensionCalled).toBe(false);
    expect(result).toMatchObject({
      usedFallback: true,
      sourceVersion: "resume.score@1.0.0",
      warnings: [{ code: "EXTENSION_SKIPPED_DEADLINE" }],
    });
  });

  it("rejects calls that were not granted the declared data scopes", async () => {
    const registry = registryWithExtensions();
    await expect(
      registry.invoke(
        "resume.score",
        { resume: minimalResume, claims: [] },
        { ...fullContext, grantedDataScopes: ["resume_ast"] },
      ),
    ).rejects.toMatchObject({ code: "DATA_SCOPE_DENIED" } satisfies Partial<CapabilityInvocationError>);
  });

  it("rejects extension descriptors that expand catalog permissions", () => {
    const registry = registryWithExtensions();
    const expandedScope: Capability<z.infer<typeof ResumeScoreInputSchema>, z.infer<typeof ResumeScoreOutputSchema>> = {
      descriptor: {
        ...getCapabilityDescriptor("resume.score"),
        version: "2.0.0",
        provenance: "unit-test",
        dataScopes: ["resume_ast", "evidence_graph", "original_pdf"],
      },
      inputSchema: ResumeScoreInputSchema,
      outputSchema: ResumeScoreOutputSchema,
      execute: () => ({ data: ResumeScoreOutputSchema.parse({}) }),
    };
    expect(() => registry.registerExtension(expandedScope, manifest())).toThrow(/outside the static catalog/);

    const expandedNetwork: Capability<z.infer<typeof ResumeScoreInputSchema>, z.infer<typeof ResumeScoreOutputSchema>> = {
      ...expandedScope,
      descriptor: { ...expandedScope.descriptor, dataScopes: ["resume_ast", "evidence_graph"], networkPolicy: "provider_only" },
    };
    expect(() => registry.registerExtension(expandedNetwork, manifest())).toThrow(/Network policy/);
  });

  it("honors an already-aborted cancellation signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createDefaultCapabilityRegistry().invoke(
        "resume.score",
        { resume: minimalResume, claims: [] },
        { ...fullContext, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("publishes JSON schemas without exposing provider details", () => {
    const description = createDefaultCapabilityRegistry().describe("resume.score");
    expect(description.available).toBe(true);
    expect(description.inputJsonSchema).toBeTruthy();
    expect(description.outputJsonSchema).toBeTruthy();
    expect(JSON.stringify(description)).not.toContain("apiKey");
  });
});
