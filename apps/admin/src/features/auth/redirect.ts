const RETURN_TO_KEY = "returnTo";
const SESSION_EXPIRED_KEY = "sessionExpired";

export function getReturnPath(state: unknown, fallback = "/"): string {
  if (state && typeof state === "object" && RETURN_TO_KEY in state) {
    const value = (state as Record<string, unknown>)[RETURN_TO_KEY];
    if (
      typeof value === "string" &&
      value.startsWith("/") &&
      !value.startsWith("//")
    ) {
      return value;
    }
  }
  return fallback;
}

/** True when the login redirect was caused by a mid-use session expiry. */
export function getSessionExpired(state: unknown): boolean {
  if (state && typeof state === "object" && SESSION_EXPIRED_KEY in state) {
    return (state as Record<string, unknown>)[SESSION_EXPIRED_KEY] === true;
  }
  return false;
}

/**
 * sessionStorage copy of the return path, saved by the 401 interceptor so the
 * path survives a full reload (location.state does not). Guards the browser
 * globals so the module stays importable in node test environments.
 */
export function saveReturnPath(path: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(RETURN_TO_KEY, path);
}

export function readSavedReturnPath(): string {
  if (typeof sessionStorage === "undefined") return "/";
  return sessionStorage.getItem(RETURN_TO_KEY) ?? "/";
}

export function clearSavedReturnPath(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(RETURN_TO_KEY);
}
