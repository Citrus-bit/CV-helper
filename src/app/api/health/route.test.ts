import { describe, expect, it, vi } from "vitest";

import { GET, LocalHealthSchema, getLocalHealth } from "./route";

describe("local health route", () => {
  it("reports the self-contained local baseline without probing a worker", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const health = await getLocalHealth({
      environment: { AI_PROVIDER: "baseline" },
      fetchImpl,
    });

    expect(health).toEqual({
      status: "ok",
      components: {
        document: { status: "ready", mode: "baseline" },
        ai: { status: "ready", mode: "baseline" },
        storage: { status: "ready", mode: "client_local" },
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports healthy local worker and enhanced AI without provider details", async () => {
    const health = await getLocalHealth({
      environment: {
        DOCUMENT_WORKER_URL: "http://worker.internal:8000/",
        AI_PROVIDER: "provider_gateway",
        AI_API_BASE: "https://xingjiabiapi.org/v1",
        AI_API_KEY: "test-secret-key",
        AI_MODEL: "test-model",
      },
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 200 })),
    });

    expect(health).toMatchObject({
      status: "ok",
      components: {
        document: { status: "ready", mode: "isolated" },
        ai: { status: "ready", mode: "enhanced" },
      },
    });
    expect(JSON.stringify(health)).not.toMatch(
      /xingjiabiapi|test-model|test-secret-key|worker\.internal/i,
    );
  });

  it("fails closed when configured local dependencies are unavailable", async () => {
    const health = await getLocalHealth({
      environment: {
        DOCUMENT_WORKER_URL: "http://unavailable.internal",
        AI_PROVIDER: "provider_gateway",
      },
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
    });

    expect(health).toMatchObject({
      status: "degraded",
      components: {
        document: { status: "degraded", mode: "isolated" },
        ai: { status: "degraded", mode: "baseline" },
        storage: { status: "ready", mode: "client_local" },
      },
    });
  });

  it("returns a no-store schema-valid response", async () => {
    vi.stubEnv("DOCUMENT_WORKER_URL", "");
    vi.stubEnv("AI_PROVIDER", "baseline");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    LocalHealthSchema.parse(await response.json());
    vi.unstubAllEnvs();
  });
});
