const RETURN_TO_KEY = "returnTo";

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
