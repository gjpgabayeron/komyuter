import type { ErrorCode } from "@komyuter/shared";

export interface ApiErrorOptions {
  statusCode: number;
  code: ErrorCode;
  message: string;
}

export class ApiError extends Error {
  statusCode: number;
  code: ErrorCode;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.code = options.code;
  }
}

export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError({ statusCode: 401, code: "UNAUTHORIZED", message });
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError({ statusCode: 403, code: "FORBIDDEN", message });
}

/**
 * A Deactivated Account: the identity and Role are kept, the access is not.
 * Distinct from `forbidden` so the SPA can end the session with an
 * access-revoked notice instead of the ordinary session-expiry copy.
 */
export function accountDeactivated(
  message = "This Account has been deactivated",
): ApiError {
  return new ApiError({
    statusCode: 403,
    code: "ACCOUNT_DEACTIVATED",
    message,
  });
}

/**
 * Forced Password Change (ADR-0019 §11): a Temporary Password is a handover,
 * and until the Account replaces it only the identity lookup and the
 * password-change action are admitted. Its own code rather than a bare
 * `FORBIDDEN`, so the SPA can route to the change screen instead of showing a
 * permissions refusal — and so the token is kept, because the Account is
 * still signed in.
 */
export function passwordChangeRequired(
  message = "This Account must change its password before continuing",
): ApiError {
  return new ApiError({
    statusCode: 403,
    code: "PASSWORD_CHANGE_REQUIRED",
    message,
  });
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError({ statusCode: 404, code: "NOT_FOUND", message });
}

export function validationError(message: string): ApiError {
  return new ApiError({ statusCode: 422, code: "VALIDATION_ERROR", message });
}

export function conflict(message: string): ApiError {
  return new ApiError({ statusCode: 409, code: "CONFLICT", message });
}

export function internal(message = "Internal server error"): ApiError {
  return new ApiError({ statusCode: 500, code: "INTERNAL", message });
}
