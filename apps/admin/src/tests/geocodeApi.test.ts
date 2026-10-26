import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { api, ApiError, AUTH_TOKEN_KEY } from "@/lib/api";
import { searchPlaces } from "@/features/routes/geocodeApi";

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

describe("searchPlaces", () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(AUTH_TOKEN_KEY, "test-token");
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    localStorage.clear();
  });

  it("calls the same-origin forward route once, with q, limit and session", async () => {
    const calls = respondWith({
      success: true,
      data: {
        results: [
          {
            id: "dXJuOm1ieHBvaTox",
            name: "SM City Iloilo",
            description: "Iloilo City, 5000, Philippines",
            location: [122.5511, 10.7144],
          },
        ],
        warning: null,
      },
    });

    const response = await searchPlaces(
      "SM City Iloilo",
      "session-1",
      undefined,
      4,
    );

    // One call, same origin: nothing here may point at a third-party geocoder
    // (the CSP would refuse it) and there is no per-row resolve any more.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/admin/mapbox/geocode");
    expect(calls[0].params).toEqual({
      q: "SM City Iloilo",
      limit: 4,
      session: "session-1",
    });
    expect(response.warning).toBeNull();
    expect(response.results).toEqual([
      {
        id: "dXJuOm1ieHBvaTox",
        name: "SM City Iloilo",
        description: "Iloilo City, 5000, Philippines",
        location: [122.5511, 10.7144],
      },
    ]);
  });

  it("passes the abort signal through so a superseded keystroke cancels", async () => {
    const calls = respondWith({
      success: true,
      data: { results: [], warning: null },
    });
    const controller = new AbortController();

    await searchPlaces("Iloilo", "session-1", controller.signal);

    expect(calls[0].signal).toBe(controller.signal);
  });

  it("surfaces no_token as a successful answer with no rows", async () => {
    respondWith({
      success: true,
      data: { results: [], warning: "no_token" },
    });
    await expect(searchPlaces("Iloilo", "session-1")).resolves.toEqual({
      results: [],
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
    await expect(searchPlaces("il", "session-1")).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
