import { describe, expect, it } from "vitest";
import {
  clearSavedReturnPath,
  getReturnPath,
  getSessionExpired,
  readSavedReturnPath,
  saveReturnPath,
} from "@/features/auth/redirect";

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

describe("getReturnPath", () => {
  it("returns a stored internal returnTo path", () => {
    expect(getReturnPath({ returnTo: "/fares" })).toBe("/fares");
  });

  it("returns the fallback when no state is present", () => {
    expect(getReturnPath(null)).toBe("/");
  });

  it("returns the fallback when returnTo is missing", () => {
    expect(getReturnPath({})).toBe("/");
  });

  it("rejects non-string returnTo values", () => {
    expect(getReturnPath({ returnTo: 42 })).toBe("/");
  });

  it("rejects external URLs to prevent open redirects", () => {
    expect(getReturnPath({ returnTo: "https://evil.example" })).toBe("/");
    expect(getReturnPath({ returnTo: "//evil.example" })).toBe("/");
  });
});

describe("expired-session redirect state", () => {
  it("flags the login redirect when the session expired mid-use", () => {
    expect(
      getSessionExpired({ sessionExpired: true, returnTo: "/fares" }),
    ).toBe(true);
  });

  it("returns false when the flag is absent or false", () => {
    expect(getSessionExpired(null)).toBe(false);
    expect(getSessionExpired({})).toBe(false);
    expect(getSessionExpired({ sessionExpired: false })).toBe(false);
  });

  it("ignores non-boolean flag values", () => {
    expect(getSessionExpired({ sessionExpired: "yes" })).toBe(false);
    expect(getSessionExpired({ sessionExpired: 1 })).toBe(false);
  });

  it("keeps the returnTo path intact alongside the expired flag", () => {
    expect(getReturnPath({ returnTo: "/fares", sessionExpired: true })).toBe(
      "/fares",
    );
  });
});

describe("saved sessionStorage return path", () => {
  it("persists a path and reads it back", () => {
    installSessionStorage();
    saveReturnPath("/fares?direction=1");
    expect(readSavedReturnPath()).toBe("/fares?direction=1");
  });

  it("returns the fallback when nothing was saved and clears on demand", () => {
    installSessionStorage();
    expect(readSavedReturnPath()).toBe("/");
    saveReturnPath("/routes");
    clearSavedReturnPath();
    expect(readSavedReturnPath()).toBe("/");
  });

  it("sanitizes a tampered saved path through getReturnPath", () => {
    installSessionStorage();
    saveReturnPath("//evil.example");
    expect(getReturnPath({ returnTo: readSavedReturnPath() })).toBe("/");
  });
});
