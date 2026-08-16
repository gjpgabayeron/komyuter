import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import type { AxiosResponse } from "axios";
import { ApiError, api, getStoredToken, setStoredToken } from "@/lib/api";
import {
  emitSessionExpired,
  onSessionExpired,
} from "@/features/auth/sessionExpired";
import { readSavedReturnPath } from "@/features/auth/redirect";

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
    location: { pathname: "/fares", search: "?direction=1" },
  });
}

/** Makes the next request(s) reject with the given HTTP status. */
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

const UNAUTHORIZED_ENVELOPE = {
  success: false,
  error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
};

describe("sessionExpired bus", () => {
  it("emits to every subscribed listener", () => {
    let first = 0;
    let second = 0;
    onSessionExpired(() => {
      first += 1;
    });
    onSessionExpired(() => {
      second += 1;
    });
    emitSessionExpired();
    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  it("stops notifying a listener after it unsubscribes", () => {
    let fired = 0;
    const unsubscribe = onSessionExpired(() => {
      fired += 1;
    });
    unsubscribe();
    emitSessionExpired();
    expect(fired).toBe(0);
  });
});

describe("api response interceptor — expired session", () => {
  afterEach(() => {
    delete api.defaults.adapter;
  });

  it("clears the stored token, saves the current path, and emits sessionExpired on a 401 from a protected endpoint", async () => {
    installLocalStorage();
    installSessionStorage();
    installWindowLocation();
    setStoredToken("stale-token");
    let fired = false;
    onSessionExpired(() => {
      fired = true;
    });
    rejectNextWith(401, UNAUTHORIZED_ENVELOPE);

    await expect(api.get("/api/routes")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(getStoredToken()).toBeNull();
    expect(fired).toBe(true);
    expect(readSavedReturnPath()).toBe("/fares?direction=1");
  });

  it("does not treat a 401 from the login endpoint as an expired session", async () => {
    installLocalStorage();
    installSessionStorage();
    setStoredToken("stale-token");
    let fired = false;
    onSessionExpired(() => {
      fired = true;
    });
    rejectNextWith(401, UNAUTHORIZED_ENVELOPE);

    await expect(api.post("/api/auth/login", {})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(fired).toBe(false);
    expect(readSavedReturnPath()).toBe("/");
  });

  it("does not emit sessionExpired on other HTTP failures", async () => {
    installLocalStorage();
    setStoredToken("stale-token");
    let fired = false;
    onSessionExpired(() => {
      fired = true;
    });
    rejectNextWith(500, { success: false, error: { code: "INTERNAL" } });

    await expect(api.get("/api/routes")).rejects.toBeInstanceOf(ApiError);
    expect(fired).toBe(false);
  });
});
