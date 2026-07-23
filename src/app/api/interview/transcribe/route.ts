import { invokeBaselineCapability } from "@/lib/baseline";
import { SpeechTranscribeInputSchema } from "@/lib/baseline/contracts";
import { TranscriptionResponseSchema } from "@/lib/client/contracts";
import { createCapabilityContext } from "@/lib/server/analysis";
import { jsonResponse, parseJsonBody, routeErrorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, SpeechTranscribeInputSchema);
    const context = createCapabilityContext(input.locale, ["selected_text"], request.signal);
    const result = await invokeBaselineCapability("speech.transcribe", input, context);
    return jsonResponse(TranscriptionResponseSchema.parse(result.data), {
      headers: { "x-capability-trace": result.sourceVersion },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
