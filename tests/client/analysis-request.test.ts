import { beforeEach, describe, expect, it } from "vitest";

import {
  beginAnalysisRequest,
  cancelAnalysisRequest,
  hasActiveAnalysisRequest,
  retainAnalysisRequest,
} from "@/lib/client/analysis-request";

describe("analysis request coordinator", () => {
  beforeEach(() => cancelAnalysisRequest());

  it("aborts the previous request when a new one begins", () => {
    const first = beginAnalysisRequest();
    const second = beginAnalysisRequest();

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(first.settle()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(hasActiveAnalysisRequest()).toBe(true);
  });

  it("rejects a late response after explicit cancellation", () => {
    const request = beginAnalysisRequest();
    cancelAnalysisRequest();

    expect(request.signal.aborted).toBe(true);
    expect(request.isCurrent()).toBe(false);
    expect(request.settle()).toBe(false);
    expect(hasActiveAnalysisRequest()).toBe(false);
  });

  it("does not cancel during a same-turn consumer release and reacquire", async () => {
    const request = beginAnalysisRequest();
    const release = retainAnalysisRequest();
    release();
    const reacquireRelease = retainAnalysisRequest();
    await Promise.resolve();

    expect(request.isCurrent()).toBe(true);
    reacquireRelease();
    await Promise.resolve();
    expect(request.signal.aborted).toBe(true);
  });
});

