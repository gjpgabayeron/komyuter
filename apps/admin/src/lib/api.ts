import axios from "axios";
import { emitSessionExpired } from "@/features/auth/sessionExpired";
import { saveReturnPath } from "@/features/auth/redirect";

export const AUTH_TOKEN_KEY = "komyuter.admin.token";

export class ApiError extends Error {
  readonly code: string;
  /** HTTP status when the failure came from an actual response. */
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === "object" && "success" in body) {
      if (body.success === true) {
        response.data = body.data;
      } else {
        return Promise.reject(
          new ApiError(
            body.error?.code ?? "INTERNAL",
            body.error?.message ?? "Request failed.",
            response.status,
          ),
        );
      }
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    // A 401 on anything but the login call means the stored token no longer
    // validates: drop it and tell the app the session expired (the AuthProvider
    // flips the state and RequireAuth redirects with the `sessionExpired` flag).
    // Login failures must NOT be treated as an expired session — they render
    // the ordinary "invalid credentials" message instead.
    if (status === 401 && !isLoginRequest(error.config?.url)) {
      // Remember where the user was so a fresh sign-in can drop them back
      // (survives a full reload, unlike location.state).
      saveReturnPath(currentPath());
      clearStoredToken();
      emitSessionExpired();
    }
    const body = error.response?.data;
    if (body && body.success === false) {
      return Promise.reject(
        new ApiError(
          body.error?.code ?? "INTERNAL",
          body.error?.message ?? "Request failed.",
          status,
        ),
      );
    }
    if (status === 401) {
      // Raw 401 without an envelope (defensive — the API always envelopes,
      // but a proxy or mock may not): classify it like the envelope case.
      return Promise.reject(
        new ApiError("UNAUTHORIZED", "Invalid or expired token", status),
      );
    }
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    return Promise.reject(
      new ApiError("NETWORK", "Cannot reach the server.", status),
    );
  },
);

function isLoginRequest(url: string | undefined): boolean {
  return Boolean(url && url.endsWith("/api/auth/login"));
}

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}
