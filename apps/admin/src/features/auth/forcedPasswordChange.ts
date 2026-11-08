import { PASSWORD_MIN_LENGTH } from "@komyuter/shared";
import { ApiError } from "@/lib/api";

/**
 * The Forced Password Change screen's route.
 *
 * Kept in one place because two callers need it: `RequireAuth` sends a flagged
 * Account here from anywhere else, and the account menu opens it voluntarily.
 */
export const CHANGE_PASSWORD_PATH = "/change-password";

/** True when `pathname` is the change screen (a trailing slash included). */
export function isPasswordChangePath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === CHANGE_PASSWORD_PATH;
}

/**
 * The single routing decision for a flagged Account (ADR-0019 §11): send it to
 * the change screen, from anywhere except the change screen itself — returning
 * `null` there is what keeps the redirect from looping.
 *
 * The server is the boundary; this only decides where to point the SPA.
 */
export function forcedPasswordRedirect(
  mustChangePassword: boolean,
  pathname: string,
): string | null {
  if (!mustChangePassword) {
    return null;
  }
  if (isPasswordChangePath(pathname)) {
    return null;
  }
  return CHANGE_PASSWORD_PATH;
}

export interface PasswordChangeIssue {
  field: "currentPassword" | "newPassword";
  message: string;
}

/**
 * The form's own check, so a typo is answered before a round trip. It applies
 * the same minimum the server enforces (`PASSWORD_MIN_LENGTH`), and the server
 * remains the authority for everything else.
 */
export function validatePasswordChange({
  currentPassword,
  newPassword,
}: {
  currentPassword: string;
  newPassword: string;
}): PasswordChangeIssue | null {
  if (!currentPassword.trim()) {
    return { field: "currentPassword", message: "Enter your current password" };
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      field: "newPassword",
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
    };
  }
  if (newPassword === currentPassword) {
    return {
      field: "newPassword",
      message: "Choose a password different from the current one",
    };
  }
  return null;
}

/**
 * The message for a refused change. A wrong current password comes back as a
 * validation refusal whose message says exactly that, so the server's own words
 * are shown rather than a generic apology.
 */
export function passwordChangeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "VALIDATION_ERROR") {
      return error.message;
    }
    if (error.code === "NETWORK") {
      return "Cannot reach the server. Check your connection and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}
