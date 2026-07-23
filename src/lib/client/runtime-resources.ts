type CacheCleaner = () => void;

const activeRequestControllers = new Set<AbortController>();
const activeObjectUrls = new Set<string>();
const cacheCleaners = new Set<CacheCleaner>();

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
