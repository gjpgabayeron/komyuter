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
import { clearStoredToken, getStoredToken } from "@/lib/api";

export type AuthStatus =
  "loading" | "unauthenticated" | "authenticating" | "authenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      if (!getStoredToken()) {
        setStatus("unauthenticated");
        return;
      }
      try {
        const currentUser = await me();
        if (cancelled) return;
        if (currentUser) {
          setUser(currentUser);
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
        }
      } catch {
        if (!cancelled) {
          setStatus("unauthenticated");
        }
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setStatus("authenticating");
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
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
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
