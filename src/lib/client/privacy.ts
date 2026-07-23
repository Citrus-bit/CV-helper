export const LEGACY_SESSION_KEY = "resume-assistant-session-v1";
export const API_RATE_LIMIT_SESSION_KEY = "resume-assistant-api-session-v1";

let inMemoryApiSessionId: string | undefined;

function validApiSessionId(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-zA-Z0-9_-]{16,128}$/.test(value));
}

function newApiSessionId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateApiSessionId(
  storage?: Pick<Storage, "getItem" | "setItem">,
): string {
  try {
    const persisted = storage?.getItem(API_RATE_LIMIT_SESSION_KEY);
    if (validApiSessionId(persisted)) {
      inMemoryApiSessionId = persisted;
      return persisted;
    }
    inMemoryApiSessionId ??= newApiSessionId();
    storage?.setItem(API_RATE_LIMIT_SESSION_KEY, inMemoryApiSessionId);
    return inMemoryApiSessionId;
  } catch {
    inMemoryApiSessionId ??= newApiSessionId();
    return inMemoryApiSessionId;
  }
}

export function clearApiSessionId(storage?: Pick<Storage, "removeItem">): void {
  inMemoryApiSessionId = undefined;
  try {
    storage?.removeItem(API_RATE_LIMIT_SESSION_KEY);
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
  }
}

export function clearLegacySession(storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
  }
}
