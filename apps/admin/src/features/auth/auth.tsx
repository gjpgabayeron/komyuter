import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { type AuthUser, login, me } from "@/features/auth/api";
import { ApiError, clearStoredToken, getStoredToken } from "@/lib/api";
import { onSessionExpired } from "@/features/auth/sessionExpired";

export type AuthStatus =
  | "loading"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "unreachable";

export type RestoreResult =
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" | "unreachable"; user: null };

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  sessionExpired: boolean;
  retrying: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  retry: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Startup session restoration. Distinguishes three outcomes:
 *  - valid session            → `authenticated`
 *  - 401 (expired/invalid)    → `unauthenticated`, token cleared
 *  - unreachable backend      → `unreachable`, token KEPT so a retry (or a
 *    later reload) can resume the session without re-signing in. The token is
 *    only ever dropped for an actual UNAUTHORIZED response.
 */
export async function restoreSession(): Promise<RestoreResult> {
  if (!getStoredToken()) {
    return { status: "unauthenticated", user: null };
  }
  try {
    const currentUser = await me();
    return currentUser
      ? { status: "authenticated", user: currentUser }
      : { status: "unauthenticated", user: null };
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
      clearStoredToken();
      return { status: "unauthenticated", user: null };
    }
    if (isUnreachable(error)) {
      return { status: "unreachable", user: null };
    }
    return { status: "unauthenticated", user: null };
  }
}

/** Transport failures (no response) or 5xx = the backend itself is the problem. */
function isUnreachable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if ((error.status ?? 0) >= 500) return true;
  return error.code === "NETWORK" && error.status === undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // A 401 from any protected request (mid-use token expiry) kicks the user
  // back to the login screen with the `sessionExpired` flag set so the screen
  // can explain why they were signed out.
  useEffect(() => {
    return onSessionExpired(() => {
      setSessionExpired(true);
      setUser(null);
      setStatus("unauthenticated");
    });
  }, []);

  const applyRestore = useCallback(async (result: RestoreResult) => {
    setUser(result.user);
    setStatus(result.status);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void restoreSession().then((result) => {
      if (!cancelled) void applyRestore(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyRestore]);

  const signIn = useCallback(async (email: string, password: string) => {
    setStatus("authenticating");
    setSessionExpired(false);
    try {
      const currentUser = await login(email, password);
      setUser(currentUser);
      setStatus("authenticated");
    } catch (error) {
      setStatus("unauthenticated");
      throw error;
    }
  }, []);

  const signOut = useCallback(() => {
    clearStoredToken();
    setUser(null);
    setSessionExpired(false);
    setStatus("unauthenticated");
  }, []);

  const retry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await applyRestore(await restoreSession());
    } finally {
      setRetrying(false);
    }
  }, [applyRestore, retrying]);

  const value = useMemo(
    () => ({ status, user, sessionExpired, retrying, signIn, signOut, retry }),
    [status, user, sessionExpired, retrying, signIn, signOut, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
