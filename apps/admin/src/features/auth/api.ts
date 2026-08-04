import { api, ApiError, clearStoredToken, setStoredToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
}

interface LoginResponse {
  access_token: string;
  user: AuthUser;
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
  return data.user;
}

export async function me(): Promise<AuthUser | null> {
  try {
    const { data } = await api.get<AuthUser>("/api/auth/me");
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
      clearStoredToken();
      return null;
    }
    throw error;
  }
}
