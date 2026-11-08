import type {
  ChangePasswordResponse,
  MeResponse,
  Permission,
  RoleSummary,
} from "@komyuter/shared";
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
  /**
   * True while a Temporary Password is still in place: the SPA may reach only
   * the change screen, which is where `RequireAuth` points it.
   */
  mustChangePassword: boolean;
}

interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

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
      mustChangePassword: data.mustChangePassword,
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
      clearStoredToken();
      return null;
    }
    throw error;
  }
}

/**
 * Replaces the Account's own password, then re-reads the identity.
 *
 * Replacing the password ends every session the Account holds at the identity
 * provider, so the server answers with a fresh one and it is stored before the
 * re-read — otherwise the next request would 401 and the SPA would treat a
 * successful change as an expired session.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthUser> {
  const { data } = await api.post<ChangePasswordResponse>(
    "/api/auth/password",
    { currentPassword, newPassword },
  );
  setStoredToken(data.access_token);
  const currentUser = await me();
  if (!currentUser) {
    throw new Error(
      "The password changed but the session could not be restored",
    );
  }
  return currentUser;
}
