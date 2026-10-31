/**
 * Forced Password Change — the third way a request can be refused.
 *
 * A flagged Account is still signed in: its token is valid, and the server
 * admits only its identity lookup and the password change. Every other response
 * is `403 PASSWORD_CHANGE_REQUIRED`, which is neither an expired session (401)
 * nor a revocation, so the token is kept and the SPA re-reads `/me` to route to
 * the change screen. Its own bus, so the three endings cannot be confused.
 */
type PasswordChangeRequiredListener = () => void;

const listeners = new Set<PasswordChangeRequiredListener>();

/** The server's error code for an Account under Forced Password Change. */
export const PASSWORD_CHANGE_REQUIRED_CODE = "PASSWORD_CHANGE_REQUIRED";

export function onPasswordChangeRequired(
  listener: PasswordChangeRequiredListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitPasswordChangeRequired(): void {
  listeners.forEach((listener) => listener());
}
