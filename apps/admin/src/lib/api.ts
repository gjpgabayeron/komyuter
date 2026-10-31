import axios from "axios";
import {
  classifyAuthFailure,
  emitAccessRevoked,
  emitPasswordChangeRequired,
  emitSessionExpired,
} from "@/features/auth/authEvents";
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
    const body = error.response?.data;
    const envelopeCode =
      body && typeof body === "object" && "success" in body
        ? (body as { error?: { code?: string } }).error?.code
        : undefined;

    // The three ways a session ends are told apart here, once: a Deactivated
    // Account (403 ACCOUNT_DEACTIVATED) is access revoked — the token is
    // dropped and the app shows its own notice, because signing in again will
    // not help; an expired or invalid token (401) is session expiry, and the
    // path is remembered so a fresh sign-in can resume it; an Account under
    // Forced Password Change (403 PASSWORD_CHANGE_REQUIRED) is still signed in,
    // so the token is KEPT and the change screen is opened instead. Login
    // failures are none of them: they render the ordinary "invalid credentials"
    // message.
    if (!isLoginRequest(error.config?.url)) {
      const failure = classifyAuthFailure(status, envelopeCode);
      if (failure === "access-revoked") {
        clearStoredToken();
        emitAccessRevoked();
      } else if (failure === "password-change-required") {
        emitPasswordChangeRequired();
      } else if (failure === "session-expired") {
        // Remember where the user was so a fresh sign-in can drop them back
        // (survives a full reload, unlike location.state).
        saveReturnPath(currentPath());
        clearStoredToken();
        emitSessionExpired();
      }
    }
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
