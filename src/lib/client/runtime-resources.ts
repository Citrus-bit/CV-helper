type CacheCleaner = () => void;
type RuntimeDisposer = () => void;

const activeRequestControllers = new Set<AbortController>();
const activeObjectUrls = new Set<string>();
const cacheCleaners = new Set<CacheCleaner>();
const runtimeDisposers = new Set<RuntimeDisposer>();

export async function trackedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

  activeRequestControllers.add(controller);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    activeRequestControllers.delete(controller);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export function cancelAllClientRequests(): void {
  for (const controller of activeRequestControllers) controller.abort();
  activeRequestControllers.clear();
}

export function registerClientRuntimeDisposer(
  disposer: RuntimeDisposer,
): () => void {
  runtimeDisposers.add(disposer);
  return () => runtimeDisposers.delete(disposer);
}

export function disposeRegisteredClientRuntimeActivities(): void {
  const pending = [...runtimeDisposers];
  runtimeDisposers.clear();
  for (const disposer of pending) {
    try {
      disposer();
    } catch {
      // One browser API must not prevent the remaining activities from stopping.
    }
  }
}

export function registerClientCacheCleaner(cleaner: CacheCleaner): () => void {
  cacheCleaners.add(cleaner);
  return () => cacheCleaners.delete(cleaner);
}

export function clearRegisteredClientCaches(): void {
  for (const cleaner of cacheCleaners) cleaner();
}

export function trackObjectUrl(url: string): string {
  activeObjectUrls.add(url);
  return url;
}

export function revokeTrackedObjectUrl(url: string): void {
  if (!activeObjectUrls.delete(url)) return;
  URL.revokeObjectURL(url);
}

export function revokeAllTrackedObjectUrls(): void {
  for (const url of activeObjectUrls) URL.revokeObjectURL(url);
  activeObjectUrls.clear();
}

export function activeClientRequestCountForTests(): number {
  return activeRequestControllers.size;
}

export function trackedObjectUrlCountForTests(): number {
  return activeObjectUrls.size;
}

export function registeredClientRuntimeDisposerCountForTests(): number {
  return runtimeDisposers.size;
}
