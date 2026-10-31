import type { MeResponse, Permission, RoleSummary } from "@komyuter/shared";
import { api, ApiError, clearStoredToken, setStoredToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** The Role the Account holds — descriptive for the owner, who holds all. */
  role: RoleSummary;
  isSuperAdmin: boolean;
  /** The effective set, as computed by the server (ADR-0019 §7). */
  permissions: Permission[];
}

interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/** Wire shape of GET /api/admin/me, mapped to the SPA's AuthUser. */

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  const { data } = await api.post<LoginResponse>("/api/auth/login", {
    email,
    password,
  });
  setStoredToken(data.access_token);
  const currentUser = await me();
  if (!currentUser) {
    throw new Error("Sign-in succeeded but the session could not be restored");
  }
  return currentUser;
}

export async function me(): Promise<AuthUser | null> {
  try {
    const { data } = await api.get<MeResponse>("/api/admin/me");
    return {
      id: data.userId,
      email: data.email,
      name: data.name,
      role: data.role,
      isSuperAdmin: data.isSuperAdmin,
      permissions: data.permissions,
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
      clearStoredToken();
      return null;
    }
    throw error;
  }
}
