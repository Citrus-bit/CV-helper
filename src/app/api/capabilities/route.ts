import { FeatureAvailabilitySchema } from "@/lib/capabilities";
import { serverCapabilityRegistry } from "@/lib/server/capability-runtime";
import { jsonResponse, routeErrorResponse } from "@/lib/server/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const availability = z.array(FeatureAvailabilitySchema).parse(serverCapabilityRegistry.getFeatureAvailability());
    return jsonResponse(availability);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
