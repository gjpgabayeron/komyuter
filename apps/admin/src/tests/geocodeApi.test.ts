import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { api, ApiError, AUTH_TOKEN_KEY } from "@/lib/api";
import { resolvePlace, suggestPlaces } from "@/features/routes/geocodeApi";

/** The client never touches `window`, but the axios interceptors read storage. */
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

const originalAdapter = api.defaults.adapter;

function respondWith(body: unknown, status = 200): AxiosRequestConfig[] {
  const calls: AxiosRequestConfig[] = [];
  api.defaults.adapter = async (config) => {
    calls.push(config);
    const response: AxiosResponse = {
      data: body,
      status,
      statusText: String(status),
      headers: {},
      config: config as never,
    };
    return response;
  };
  return calls;
}

describe("suggestPlaces", () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(AUTH_TOKEN_KEY, "test-token");
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    localStorage.clear();
  });

  it("calls the same-origin suggest route with q, limit and session", async () => {
    const calls = respondWith({
      success: true,
      data: {
        suggestions: [
          {
            id: "dXJuOm1ieHBvaTox",
            name: "SM City Iloilo",
            description: "Iloilo City, 5000, Philippines",
          },
        ],
        warning: null,
      },
    });

    const response = await suggestPlaces(
      "SM City Iloilo",
      "session-1",
      undefined,
      4,
    );

    // Issue #16: same origin only — never a third-party geocoder the CSP refuses.
    expect(calls[0].url).toBe("/api/admin/mapbox/geocode");
    expect(calls[0].params).toEqual({
      q: "SM City Iloilo",
      limit: 4,
      session: "session-1",
    });
    expect(response.warning).toBeNull();
    expect(response.suggestions).toEqual([
      {
        id: "dXJuOm1ieHBvaTox",
        name: "SM City Iloilo",
        description: "Iloilo City, 5000, Philippines",
      },
    ]);
  });

  it("passes the abort signal through so a superseded keystroke cancels", async () => {
    const calls = respondWith({
      success: true,
      data: { suggestions: [], warning: null },
    });
    const controller = new AbortController();

    await suggestPlaces("Iloilo", "session-1", controller.signal);

    expect(calls[0].signal).toBe(controller.signal);
  });

  it("surfaces no_token as a successful answer with no rows", async () => {
    respondWith({
      success: true,
      data: { suggestions: [], warning: "no_token" },
    });
    await expect(suggestPlaces("Iloilo", "session-1")).resolves.toEqual({
      suggestions: [],
      warning: "no_token",
    });
  });

  it("rejects with ApiError when the server refuses the query", async () => {
    respondWith(
      {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Query too short" },
      },
      422,
    );
    await expect(suggestPlaces("il", "session-1")).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe("resolvePlace", () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(AUTH_TOKEN_KEY, "test-token");
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    localStorage.clear();
  });

  it("resolves a suggestion id into a coordinate on the resolve route", async () => {
    const calls = respondWith({
      success: true,
      data: { location: [122.5511369, 10.7144566], warning: null },
    });

    const response = await resolvePlace("dXJuOm1ieHBvaTox", "session-1");

    expect(calls[0].url).toBe("/api/admin/mapbox/geocode/resolve");
    expect(calls[0].params).toEqual({
      id: "dXJuOm1ieHBvaTox",
      session: "session-1",
    });
    expect(response).toEqual({
      location: [122.5511369, 10.7144566],
      warning: null,
    });
  });

  it("keeps a degraded answer as a null location plus its warning", async () => {
    respondWith({
      success: true,
      data: { location: null, warning: "upstream_error" },
    });
    await expect(resolvePlace("abc", "session-1")).resolves.toEqual({
      location: null,
      warning: "upstream_error",
    });
  });
});
