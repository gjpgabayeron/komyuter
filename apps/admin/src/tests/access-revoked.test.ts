import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import type { AxiosResponse } from "axios";
import { api, getStoredToken, setStoredToken } from "@/lib/api";
import {
  ACCESS_REVOKED_CODE,
  classifyAuthFailure,
  emitAccessRevoked,
  onAccessRevoked,
} from "@/features/auth/accessRevoked";
import {
  emitSessionExpired,
  onSessionExpired,
} from "@/features/auth/sessionExpired";
import {
  getAccessRevoked,
  readSavedReturnPath,
} from "@/features/auth/redirect";

function installLocalStorage(): void {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  globalThis.localStorage = storage;
}

function installSessionStorage(): void {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  globalThis.sessionStorage = storage;
}

function installWindowLocation(): void {
  vi.stubGlobal("window", {
    location: { pathname: "/fares", search: "" },
  });
}

/** Makes the next request(s) reject with the given HTTP status and body. */
function rejectNextWith(status: number, data?: unknown): void {
  api.defaults.adapter = async (config) => {
    const response: AxiosResponse = {
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
      request: {},
    };
    throw new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_REQUEST,
      config,
      undefined,
      response,
    );
  };
}

const DEACTIVATED_ENVELOPE = {
  success: false,
  error: {
    code: "ACCOUNT_DEACTIVATED",
    message: "This Account has been deactivated",
  },
};

describe("classifyAuthFailure", () => {
  it("treats a Deactivated Account's refusal as access revoked", () => {
    expect(classifyAuthFailure(403, ACCESS_REVOKED_CODE)).toBe(
      "access-revoked",
    );
  });

  it("treats a 401 as an expired session", () => {
    expect(classifyAuthFailure(401, "UNAUTHORIZED")).toBe("session-expired");
  });

  it("treats any other refusal as neither", () => {
    expect(classifyAuthFailure(403, "FORBIDDEN")).toBeNull();
    expect(classifyAuthFailure(500, "INTERNAL")).toBeNull();
    expect(classifyAuthFailure(undefined, undefined)).toBeNull();
  });
});

describe("accessRevoked bus", () => {
  it("emits to every subscribed listener and stops after unsubscribing", () => {
    let first = 0;
    let second = 0;
    const unsubscribe = onAccessRevoked(() => {
      first += 1;
    });
    onAccessRevoked(() => {
      second += 1;
    });
    emitAccessRevoked();
    unsubscribe();
    emitAccessRevoked();
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it("is a separate bus from session expiry", () => {
    let expired = 0;
    let revoked = 0;
    onSessionExpired(() => {
      expired += 1;
    });
    onAccessRevoked(() => {
      revoked += 1;
    });
    emitAccessRevoked();
    expect(revoked).toBe(1);
    expect(expired).toBe(0);
    emitSessionExpired();
    expect(revoked).toBe(1);
    expect(expired).toBe(1);
  });
});

describe("api response interceptor — access revoked", () => {
  afterEach(() => {
    delete api.defaults.adapter;
  });

  it("clears the stored token and emits accessRevoked on ACCOUNT_DEACTIVATED", async () => {
    installLocalStorage();
    installSessionStorage();
    installWindowLocation();
    setStoredToken("deactivated-token");
    let revoked = 0;
    let expired = 0;
    onAccessRevoked(() => {
      revoked += 1;
    });
    onSessionExpired(() => {
      expired += 1;
    });
    rejectNextWith(403, DEACTIVATED_ENVELOPE);

    await expect(api.get("/api/admin/me")).rejects.toMatchObject({
      code: "ACCOUNT_DEACTIVATED",
    });
    expect(getStoredToken()).toBeNull();
    expect(revoked).toBe(1);
    expect(expired).toBe(0);
    // A revoked session is not resumable, so the path is not offered back.
    expect(readSavedReturnPath()).toBe("/");
  });

  it("leaves the token alone on an ordinary 403", async () => {
    installLocalStorage();
    installSessionStorage();
    setStoredToken("viewer-token");
    let revoked = 0;
    onAccessRevoked(() => {
      revoked += 1;
    });
    rejectNextWith(403, {
      success: false,
      error: { code: "FORBIDDEN", message: "Missing permission: ADMIN_MANAGE" },
    });

    await expect(api.get("/api/admin/accounts")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(getStoredToken()).toBe("viewer-token");
    expect(revoked).toBe(0);
  });

  it("still routes a 401 through the session-expiry path only", async () => {
    installLocalStorage();
    installSessionStorage();
    installWindowLocation();
    setStoredToken("stale-token");
    let revoked = 0;
    let expired = 0;
    onAccessRevoked(() => {
      revoked += 1;
    });
    onSessionExpired(() => {
      expired += 1;
    });
    rejectNextWith(401, {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });

    await expect(api.get("/api/admin/me")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(getStoredToken()).toBeNull();
    expect(expired).toBe(1);
    expect(revoked).toBe(0);
  });
});

describe("getAccessRevoked", () => {
  it("reads the login redirect flag", () => {
    expect(getAccessRevoked({ accessRevoked: true })).toBe(true);
  });

  it("is false when absent, false, or not a boolean", () => {
    expect(getAccessRevoked(null)).toBe(false);
    expect(getAccessRevoked({})).toBe(false);
    expect(getAccessRevoked({ accessRevoked: false })).toBe(false);
    expect(getAccessRevoked({ accessRevoked: "yes" })).toBe(false);
  });

  it("does not read a session-expiry flag as access revoked", () => {
    expect(getAccessRevoked({ sessionExpired: true })).toBe(false);
  });
});
