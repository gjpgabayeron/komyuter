import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { type AuthUser, changePassword, login, me } from "@/features/auth/api";
import { ApiError, clearStoredToken, getStoredToken } from "@/lib/api";
import {
  onAccessRevoked,
  onPasswordChangeRequired,
  onSessionExpired,
} from "@/features/auth/authEvents";

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
  /** True when the session ended because the Account was deactivated. */
  accessRevoked: boolean;
  retrying: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  retry: () => Promise<void>;
  /** Re-reads the identity — after a password change, or when the flag appears. */
  refreshUser: () => Promise<void>;
  /** Replaces the Account's own password and adopts the identity it answers. */
  changeOwnPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
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
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // A 401 from any protected request (mid-use token expiry) kicks the user
  // back to the login screen with the `sessionExpired` flag set so the screen
  // can explain why they were signed out.
  useEffect(() => {
    return onSessionExpired(() => {
      setSessionExpired(true);
      setAccessRevoked(false);
      setUser(null);
      setStatus("unauthenticated");
    });
  }, []);

  // A Deactivated Account is the other ending: the server refuses its live
  // session with 403 ACCOUNT_DEACTIVATED, the token is already cleared by the
  // interceptor, and the login screen explains that signing in again will not
  // help. It is not read as an expiry.
  useEffect(() => {
    return onAccessRevoked(() => {
      setAccessRevoked(true);
      setSessionExpired(false);
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
    setAccessRevoked(false);
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
    setAccessRevoked(false);
    setStatus("unauthenticated");
  }, []);

  /** Re-reads the identity the server currently resolves for this session. */
  const refreshUser = useCallback(async () => {
    const currentUser = await me();
    if (currentUser) {
      setUser(currentUser);
    }
  }, []);

  const changeOwnPassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      // The action stores the session it answers with before this resolves, so
      // the identity read here is made with a live token.
      setUser(await changePassword(currentPassword, newPassword));
    },
    [],
  );

  // The third ending: a request refused with 403 PASSWORD_CHANGE_REQUIRED means
  // the flag appeared while the Account was working (a forced reset from
  // elsewhere). The token is still valid, so the session is not ended — the
  // identity is re-read, and the fresh `mustChangePassword` is what sends the
  // Account to the change screen.
  useEffect(
    () =>
      onPasswordChangeRequired(() => {
        void refreshUser().catch(() => {});
      }),
    [refreshUser],
  );

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
    () => ({
      status,
      user,
      sessionExpired,
      accessRevoked,
      retrying,
      signIn,
      signOut,
      retry,
      refreshUser,
      changeOwnPassword,
    }),
    [
      status,
      user,
      sessionExpired,
      accessRevoked,
      retrying,
      signIn,
      signOut,
      retry,
      refreshUser,
      changeOwnPassword,
    ],
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
