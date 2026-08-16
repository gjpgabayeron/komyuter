type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();

/**
 * Subscribe to session-expiry events. Returns an unsubscribe function.
 * Emitted by the API response interceptor when a protected request returns
 * 401; the AuthProvider listens and flips the session state so the router
 * redirects to the login screen with a `sessionExpired` flag.
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSessionExpired(): void {
  listeners.forEach((listener) => listener());
}
