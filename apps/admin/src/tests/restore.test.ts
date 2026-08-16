import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getStoredToken, setStoredToken } from "@/lib/api";
import { restoreSession } from "@/features/auth/auth";

vi.mock("@/features/auth/api", () => ({
  login: vi.fn(),
  me: vi.fn(),
}));

import { me } from "@/features/auth/api";

const mockedMe = vi.mocked(me);

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

const ADMIN = { id: "u1", email: "admin@komyuter.ph", name: "Admin" };

describe("restoreSession", () => {
  beforeEach(() => {
    installLocalStorage();
    mockedMe.mockReset();
  });

  it("goes straight to unauthenticated when no token is stored", async () => {
    const result = await restoreSession();
    expect(result.status).toBe("unauthenticated");
    expect(mockedMe).not.toHaveBeenCalled();
  });

  it("restores to authenticated when the session is still valid", async () => {
    setStoredToken("valid-token");
    mockedMe.mockResolvedValue(ADMIN);

    const result = await restoreSession();
    expect(result).toEqual({ status: "authenticated", user: ADMIN });
  });

  it("flips to unauthenticated and clears the token on a 401", async () => {
    setStoredToken("expired-token");
    mockedMe.mockRejectedValue(
      new ApiError("UNAUTHORIZED", "Invalid or expired token"),
    );

    const result = await restoreSession();
    expect(result.status).toBe("unauthenticated");
    expect(getStoredToken()).toBeNull();
  });

  it("flips to unreachable and keeps the token on a network failure", async () => {
    setStoredToken("still-good-token");
    mockedMe.mockRejectedValue(
      new ApiError("NETWORK", "Cannot reach the server."),
    );

    const result = await restoreSession();
    expect(result.status).toBe("unreachable");
    expect(getStoredToken()).toBe("still-good-token");
  });

  it("flips to unreachable and keeps the token on a 5xx", async () => {
    setStoredToken("still-good-token");
    mockedMe.mockRejectedValue(
      new ApiError("INTERNAL", "Server exploded", 503),
    );

    const result = await restoreSession();
    expect(result.status).toBe("unreachable");
    expect(getStoredToken()).toBe("still-good-token");
  });

  it("treats other non-401 failures as a sign-out but keeps the token", async () => {
    setStoredToken("odd-token");
    mockedMe.mockRejectedValue(new ApiError("FORBIDDEN", "Not allowed", 403));

    const result = await restoreSession();
    expect(result.status).toBe("unauthenticated");
    expect(getStoredToken()).toBe("odd-token");
  });
});
