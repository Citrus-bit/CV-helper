/**
 * Coordinates the one analysis request that may be active for the anonymous
 * workspace. The controller deliberately lives outside React state: it is
 * neither serializable nor something we want to persist in sessionStorage.
 */

type ActiveRequest = {
  controller: AbortController;
};

let activeRequest: ActiveRequest | null = null;
let retainedConsumers = 0;
let leaseVersion = 0;

export type AnalysisRequestHandle = {
  signal: AbortSignal;
  /** True while this handle is the request currently owned by the workspace. */
  isCurrent: () => boolean;
  /**
   * Atomically invalidate this handle and claim the response. A late response
   * receives false and must not update the store.
   */
  settle: () => boolean;
};

function isCurrentRequest(request: ActiveRequest) {
  return activeRequest === request && !request.controller.signal.aborted;
}

export function beginAnalysisRequest(): AnalysisRequestHandle {
  cancelAnalysisRequest();

  const request: ActiveRequest = { controller: new AbortController() };
  activeRequest = request;

  return {
    signal: request.controller.signal,
    isCurrent: () => isCurrentRequest(request),
    settle: () => {
      if (!isCurrentRequest(request)) return false;
      activeRequest = null;
      return true;
    },
  };
}

/** Abort the active request and invalidate its response immediately. */
export function cancelAnalysisRequest() {
  const request = activeRequest;
  activeRequest = null;
  request?.controller.abort();
}

/**
 * Retain the active request while the analysis screen is mounted. The delayed
 * release avoids aborting during React Strict Mode's setup/cleanup replay.
 */
export function retainAnalysisRequest() {
  retainedConsumers += 1;
  let retained = true;

  return () => {
    if (!retained) return;
    retained = false;
    retainedConsumers = Math.max(0, retainedConsumers - 1);
    const releaseVersion = ++leaseVersion;
    queueMicrotask(() => {
      if (releaseVersion === leaseVersion && retainedConsumers === 0) cancelAnalysisRequest();
    });
  };
}

/** Test-only observability without exposing the controller itself. */
export function hasActiveAnalysisRequest() {
  return activeRequest !== null;
}

