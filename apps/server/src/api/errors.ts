import { ERROR_CODE } from "@komyuter/shared";
import type { ErrorCode } from "@komyuter/shared";

export interface ApiErrorOptions {
  statusCode: number;
  code: ErrorCode;
  message: string;
  /** Extra fields merged into the error envelope. Only for facts the client
   *  needs to act on — the envelope itself stays `{ success, data | error }`. */
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  statusCode: number;
  code: ErrorCode;
  details?: Record<string, unknown>;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}

export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError({
    statusCode: 401,
    code: ERROR_CODE.UNAUTHORIZED,
    message,
  });
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError({ statusCode: 403, code: ERROR_CODE.FORBIDDEN, message });
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
    code: ERROR_CODE.ACCOUNT_DEACTIVATED,
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
    code: ERROR_CODE.PASSWORD_CHANGE_REQUIRED,
    message,
  });
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError({ statusCode: 404, code: ERROR_CODE.NOT_FOUND, message });
}

export function validationError(message: string): ApiError {
  return new ApiError({
    statusCode: 422,
    code: ERROR_CODE.VALIDATION_ERROR,
    message,
  });
}

export function conflict(message: string): ApiError {
  return new ApiError({ statusCode: 409, code: ERROR_CODE.CONFLICT, message });
}

/**
 * A save whose base is stale (ADR-0020). Distinct from the structural
 * `CONFLICT` because this one is resolvable: the client refetches the current
 * state and reconciles it with the Draft. `current_version` lets the client
 * tell whether a save raced the fetch it just made.
 */
export function versionConflict(currentVersion: number): ApiError {
  return new ApiError({
    statusCode: 409,
    code: ERROR_CODE.VERSION_CONFLICT,
    message: `This save is based on an outdated version (current ${currentVersion}). Reload and resolve the conflict.`,
    details: { current_version: currentVersion },
  });
}

export function internal(message = "Internal server error"): ApiError {
  return new ApiError({ statusCode: 500, code: ERROR_CODE.INTERNAL, message });
}
