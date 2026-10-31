/**
 * Access revocation — the Deactivated Account's side of the lifecycle.
 *
 * A Deactivated Account's Supabase token is still valid; the server refuses it
 * at the guard with `403 ACCOUNT_DEACTIVATED` (ADR-0019 §2). That is a different
 * ending from an expired session (401): the Account cannot sign itself back in,
 * so the SPA clears the token and shows an access-revoked notice instead of the
 * session-expired copy. Kept as its own bus so neither path can be mistaken for
 * the other.
 */
type AccessRevokedListener = () => void;

const listeners = new Set<AccessRevokedListener>();

/** The server's error code for a Deactivated Account. */
export const ACCESS_REVOKED_CODE = "ACCOUNT_DEACTIVATED";

export type AuthFailure = "session-expired" | "access-revoked" | null;

/**
 * Which ending an auth failure represents. Pure so the interceptor's rule is
 * testable without a browser; the login call is handled by the caller because
 * its 401 is an ordinary "invalid credentials", not an expired session.
 */
export function classifyAuthFailure(
  status: number | undefined,
  code: string | undefined,
): AuthFailure {
  if (code === ACCESS_REVOKED_CODE) return "access-revoked";
  if (status === 401) return "session-expired";
  return null;
}

export function onAccessRevoked(listener: AccessRevokedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAccessRevoked(): void {
  listeners.forEach((listener) => listener());
}
