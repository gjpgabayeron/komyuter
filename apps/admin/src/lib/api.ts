import axios from "axios";

export const AUTH_TOKEN_KEY = "komyuter.admin.token";

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
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
          ),
        );
      }
    }
    return response;
  },
  (error) => {
    const body = error.response?.data;
    if (body && body.success === false) {
      return Promise.reject(
        new ApiError(
          body.error?.code ?? "INTERNAL",
          body.error?.message ?? "Request failed.",
        ),
      );
    }
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    return Promise.reject(new ApiError("NETWORK", "Cannot reach the server."));
  },
);
