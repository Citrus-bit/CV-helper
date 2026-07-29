import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function audioRequest(browserTranscript = "browser draft") {
  const form = new FormData();
  form.set(
    "audio",
    new File(["recorded bytes"], "untrusted-name.wav", {
      type: "audio/webm;codecs=opus",
    }),
  );
  form.set("locale", "mixed");
  form.set("browserTranscript", browserTranscript);
  form.set("browserConfidence", "0.72");
  return new Request("http://localhost/api/interview/transcribe", {
    method: "POST",
    body: form,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("interview audio transcription", () => {
  it("uses the local FunASR endpoint and reports strict audio provenance", async () => {
    vi.stubEnv("FUNASR_API_BASE", "http://127.0.0.1:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ text: "I improved activation by nineteen percent." }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(audioRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-capability-trace")).toBe(
      "speech.transcribe@funasr",
    );
    expect(await response.json()).toMatchObject({
      transcript: "I improved activation by nineteen percent.",
      source: "funasr",
      audioProcessed: true,
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe("http://127.0.0.1:8000/v1/audio/transcriptions");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("sensevoice");
    expect(form.get("response_format")).toBe("json");
    expect(form.get("language")).toBeNull();
    expect((form.get("file") as File).name).toBe("interview-answer.webm");
  });

  it("keeps the browser transcript when the local FunASR service is unavailable", async () => {
    vi.stubEnv("FUNASR_API_BASE", "http://speech-worker:8000");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const response = await POST(audioRequest("  browser fallback  "));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      transcript: "browser fallback",
      source: "browser-speech-recognition",
      audioProcessed: false,
    });
  });

  it("rejects a non-local FunASR URL without forwarding audio", async () => {
    vi.stubEnv("FUNASR_API_BASE", "https://example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(audioRequest("safe fallback"));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      transcript: "safe fallback",
      audioProcessed: false,
    });
  });

  it("returns a bounded error when neither FunASR nor a browser draft is available", async () => {
    vi.stubEnv("FUNASR_API_BASE", "http://127.0.0.1:8000");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private detail")));

    const response = await POST(audioRequest(""));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "本地增强语音转写暂时不可用，请直接输入文字回答。",
      code: "SPEECH_TRANSCRIPTION_UNAVAILABLE",
      retryable: true,
    });
  });
});
