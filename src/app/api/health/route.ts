import { z } from "zod";

import { isProviderGatewayConfigured } from "@/lib/server/ai/provider-gateway";
import { jsonResponse, routeErrorResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HealthComponentSchema = z.object({
  status: z.enum(["ready", "degraded"]),
  mode: z.enum(["baseline", "isolated", "enhanced", "client_local"]),
});

export const LocalHealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  components: z.object({
    document: HealthComponentSchema,
    ai: HealthComponentSchema,
    storage: HealthComponentSchema,
  }),
});

type HealthEnvironment = Readonly<Record<string, string | undefined>>;

export async function getLocalHealth(
  options: {
    environment?: HealthEnvironment;
    fetchImpl?: typeof fetch;
  } = {},
) {
  const environment = options.environment ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const workerUrl = environment.DOCUMENT_WORKER_URL?.trim().replace(/\/+$/, "");

  let document: z.infer<typeof HealthComponentSchema> = {
    status: "ready",
    mode: "baseline",
  };
  if (workerUrl) {
    document = { status: "degraded", mode: "isolated" };
    try {
      const response = await fetchImpl(`${workerUrl}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) document = { status: "ready", mode: "isolated" };
    } catch {
      // Health responses intentionally omit upstream URLs and error details.
    }
  }

  const providerRequested = Boolean(
    environment.AI_PROVIDER?.trim() &&
    environment.AI_PROVIDER?.trim() !== "baseline",
  );
  const providerReady = isProviderGatewayConfigured(environment);
  const ai: z.infer<typeof HealthComponentSchema> = providerReady
    ? { status: "ready", mode: "enhanced" }
    : {
        status: providerRequested ? "degraded" : "ready",
        mode: "baseline",
      };

  return LocalHealthSchema.parse({
    status:
      document.status === "degraded" || ai.status === "degraded"
        ? "degraded"
        : "ok",
    components: {
      document,
      ai,
      storage: { status: "ready", mode: "client_local" },
    },
  });
}

export async function GET() {
  try {
    return jsonResponse(await getLocalHealth());
  } catch (error) {
    return routeErrorResponse(error);
  }
}
