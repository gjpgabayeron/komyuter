import { ERROR_CODE } from "@komyuter/shared";

/**
 * The three ways a live session can end, and the one place their rules live.
 *
 * A request can be refused in ways that share an HTTP status but mean very
 * different things (ADR-0019 §2, §11):
 *
 *  - **session expired** — a `401`: the token is gone. The SPA clears it,
 *    remembers the path, and offers a fresh sign-in.
 *  - **access revoked** — `403 ACCOUNT_DEACTIVATED`: the Account was
 *    deactivated and cannot sign itself back in. The SPA clears the token and
 *    shows the revocation notice instead of the expiry copy.
 *  - **password change required** — `403 PASSWORD_CHANGE_REQUIRED`: the Account
 *    is still signed in and is being held on the change screen, so the token is
 *    KEPT and `/me` is re-read to route there.
 *
 * Each ending gets its own listener set so no handler can mistake one for
 * another, but they are defined together (one module, one small factory)
 * because the interceptor asks a single question — `classifyAuthFailure` —
 * whose answer is one of the three. A module per ending made the shared
 * question live in whichever ending happened to be written first.
 */
type Listener = () => void;

interface AuthEventBus {
  subscribe(listener: Listener): () => void;
  emit(): void;
}

/** One bus per ending: separate listener sets, identical mechanics. */
function createBus(): AuthEventBus {
  const listeners = new Set<Listener>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      listeners.forEach((listener) => listener());
    },
  };
}

/** The server's error code for a Deactivated Account. */
export const ACCESS_REVOKED_CODE = ERROR_CODE.ACCOUNT_DEACTIVATED;

/** The server's error code for an Account under Forced Password Change. */
export const PASSWORD_CHANGE_REQUIRED_CODE =
  ERROR_CODE.PASSWORD_CHANGE_REQUIRED;

export type AuthFailure =
  "session-expired" | "access-revoked" | "password-change-required" | null;

/**
 * Which ending an auth failure represents. Pure, so the interceptor's rule is
 * testable without a browser; the login call is handled by the caller because
 * its 401 is an ordinary "invalid credentials", not an expired session.
 *
 * The three outcomes share statuses, so the code decides first: a flagged
 * Account is still signed in (`PASSWORD_CHANGE_REQUIRED`), a deactivated one
 * is not (`ACCOUNT_DEACTIVATED`), and a bare 401 is an expired token.
 */
export function classifyAuthFailure(
  status: number | undefined,
  code: string | undefined,
): AuthFailure {
  if (code === ACCESS_REVOKED_CODE) return "access-revoked";
  if (code === PASSWORD_CHANGE_REQUIRED_CODE) return "password-change-required";
  if (status === 401) return "session-expired";
  return null;
}

const sessionExpired = createBus();
const accessRevoked = createBus();
const passwordChangeRequired = createBus();

/**
 * Subscribe to session-expiry events. Returns an unsubscribe function.
 * Emitted by the API response interceptor on a 401; the AuthProvider listens
 * and flips the session state so the router redirects to the login screen with
 * a `sessionExpired` flag.
 */
export const onSessionExpired = sessionExpired.subscribe;

export function emitSessionExpired(): void {
  sessionExpired.emit();
}

/** Subscribe to access-revocation events. Returns an unsubscribe function. */
export const onAccessRevoked = accessRevoked.subscribe;

export function emitAccessRevoked(): void {
  accessRevoked.emit();
}

/** Subscribe to forced-password-change events. Returns an unsubscribe function. */
export const onPasswordChangeRequired = passwordChangeRequired.subscribe;

export function emitPasswordChangeRequired(): void {
  passwordChangeRequired.emit();
}
