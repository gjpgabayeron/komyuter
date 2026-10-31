import { afterEach, describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import type { AxiosResponse } from "axios";
import { PASSWORD_MIN_LENGTH } from "@komyuter/shared";
import { ApiError, api, getStoredToken, setStoredToken } from "@/lib/api";
import {
  CHANGE_PASSWORD_PATH,
  forcedPasswordRedirect,
  isPasswordChangePath,
  passwordChangeErrorMessage,
  validatePasswordChange,
} from "@/features/auth/forcedPasswordChange";
import {
  PASSWORD_CHANGE_REQUIRED_CODE,
  emitPasswordChangeRequired,
  onPasswordChangeRequired,
} from "@/features/auth/passwordChangeRequired";
import {
  onAccessRevoked,
  classifyAuthFailure,
} from "@/features/auth/accessRevoked";
import { onSessionExpired } from "@/features/auth/sessionExpired";

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

describe("forcedPasswordRedirect", () => {
  it("sends a flagged Account to the change screen from any other page", () => {
    expect(forcedPasswordRedirect(true, "/")).toBe(CHANGE_PASSWORD_PATH);
    expect(forcedPasswordRedirect(true, "/routes")).toBe(CHANGE_PASSWORD_PATH);
    expect(forcedPasswordRedirect(true, "/fares?direction=1")).toBe(
      CHANGE_PASSWORD_PATH,
    );
  });

  it("leaves a flagged Account on the change screen, so the redirect settles", () => {
    expect(forcedPasswordRedirect(true, CHANGE_PASSWORD_PATH)).toBeNull();
  });

  it("redirects nothing once the flag is clear", () => {
    expect(forcedPasswordRedirect(false, "/")).toBeNull();
    expect(forcedPasswordRedirect(false, CHANGE_PASSWORD_PATH)).toBeNull();
  });

  it("recognizes the change screen with or without a trailing slash", () => {
    expect(isPasswordChangePath(CHANGE_PASSWORD_PATH)).toBe(true);
    expect(isPasswordChangePath(`${CHANGE_PASSWORD_PATH}/`)).toBe(true);
    expect(isPasswordChangePath("/change-password/extra")).toBe(false);
    expect(isPasswordChangePath("/")).toBe(false);
  });
});

describe("validatePasswordChange", () => {
  it("accepts a current password and a new one at the shared minimum", () => {
    expect(
      validatePasswordChange({
        currentPassword: "temporary-password-1",
        newPassword: "x".repeat(PASSWORD_MIN_LENGTH),
      }),
    ).toBeNull();
  });

  it("asks for the current password", () => {
    expect(
      validatePasswordChange({
        currentPassword: "   ",
        newPassword: "a-long-enough-password",
      }),
    ).toEqual({
      field: "currentPassword",
      message: "Enter your current password",
    });
  });

  it("enforces the same minimum length an invite's password satisfies", () => {
    expect(
      validatePasswordChange({
        currentPassword: "temporary-password-1",
        newPassword: "x".repeat(PASSWORD_MIN_LENGTH - 1),
      }),
    ).toEqual({
      field: "newPassword",
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
    });
  });

  it("refuses a new password identical to the current one", () => {
    expect(
      validatePasswordChange({
        currentPassword: "same-password-value",
        newPassword: "same-password-value",
      }),
    ).toEqual({
      field: "newPassword",
      message: "Choose a password different from the current one",
    });
  });
});

describe("passwordChangeErrorMessage", () => {
  it("shows the server's own reason for a rejected change", () => {
    expect(
      passwordChangeErrorMessage(
        new ApiError(
          "VALIDATION_ERROR",
          "The current password is incorrect",
          422,
        ),
      ),
    ).toBe("The current password is incorrect");
  });

  it("explains an unreachable backend", () => {
    expect(
      passwordChangeErrorMessage(
        new ApiError("NETWORK", "Cannot reach the server.", undefined),
      ),
    ).toBe("Cannot reach the server. Check your connection and try again.");
  });

  it("falls back for anything else", () => {
    expect(passwordChangeErrorMessage(new Error("boom"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});

describe("passwordChangeRequired bus", () => {
  it("emits to every listener and stops after unsubscribing", () => {
    let first = 0;
    let second = 0;
    const unsubscribe = onPasswordChangeRequired(() => {
      first += 1;
    });
    onPasswordChangeRequired(() => {
      second += 1;
    });
    emitPasswordChangeRequired();
    unsubscribe();
    emitPasswordChangeRequired();
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it("is classified before the ordinary refusals it shares a status with", () => {
    expect(classifyAuthFailure(403, PASSWORD_CHANGE_REQUIRED_CODE)).toBe(
      "password-change-required",
    );
  });
});

describe("api response interceptor — password change required", () => {
  afterEach(() => {
    delete api.defaults.adapter;
  });

  it("emits the password-change signal and keeps the session's token", async () => {
    installLocalStorage();
    setStoredToken("flagged-token");
    let required = 0;
    let revoked = 0;
    let expired = 0;
    onPasswordChangeRequired(() => {
      required += 1;
    });
    onAccessRevoked(() => {
      revoked += 1;
    });
    onSessionExpired(() => {
      expired += 1;
    });
    rejectNextWith(403, {
      success: false,
      error: {
        code: PASSWORD_CHANGE_REQUIRED_CODE,
        message: "This Account must change its password",
      },
    });

    await expect(api.get("/api/admin/routes")).rejects.toMatchObject({
      code: PASSWORD_CHANGE_REQUIRED_CODE,
    });
    expect(required).toBe(1);
    // The Account is still signed in: this is not an expiry and not revocation.
    expect(getStoredToken()).toBe("flagged-token");
    expect(revoked).toBe(0);
    expect(expired).toBe(0);
  });
});
