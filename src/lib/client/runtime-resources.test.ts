// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activeClientRequestCountForTests,
  cancelAllClientRequests,
  clearRegisteredClientCaches,
  disposeRegisteredClientRuntimeActivities,
  registeredClientRuntimeDisposerCountForTests,
  registerClientCacheCleaner,
  registerClientRuntimeDisposer,
  revokeAllTrackedObjectUrls,
  trackObjectUrl,
  trackedFetch,
  trackedObjectUrlCountForTests,
} from "./runtime-resources";

afterEach(() => {
  cancelAllClientRequests();
  disposeRegisteredClientRuntimeActivities();
  revokeAllTrackedObjectUrls();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("client runtime resource registry", () => {
  it("aborts every tracked fetch", async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = trackedFetch("/slow");
    expect(activeClientRequestCountForTests()).toBe(1);

    cancelAllClientRequests();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(activeClientRequestCountForTests()).toBe(0);
  });

  it("clears registered caches and revokes all tracked object URLs", () => {
    const cleaner = vi.fn();
    const unregister = registerClientCacheCleaner(cleaner);
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    trackObjectUrl("blob:resume-one");
    trackObjectUrl("blob:resume-two");

    clearRegisteredClientCaches();
    revokeAllTrackedObjectUrls();

    expect(cleaner).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(trackedObjectUrlCountForTests()).toBe(0);
    unregister();
  });

  it("runs registered activity disposers once and isolates disposer failures", () => {
    const first = vi.fn(() => {
      throw new Error("browser API already closed");
    });
    const second = vi.fn();
    const removed = vi.fn();
    registerClientRuntimeDisposer(first);
    registerClientRuntimeDisposer(second);
    const unregisterRemoved = registerClientRuntimeDisposer(removed);
    unregisterRemoved();

    expect(registeredClientRuntimeDisposerCountForTests()).toBe(2);
    disposeRegisteredClientRuntimeActivities();
    disposeRegisteredClientRuntimeActivities();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
    expect(registeredClientRuntimeDisposerCountForTests()).toBe(0);
  });
});
