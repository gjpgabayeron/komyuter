export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "ACCOUNT_DEACTIVATED",
  "PASSWORD_CHANGE_REQUIRED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * The same codes, reachable by name — `ERROR_CODE.ACCOUNT_DEACTIVATED`.
 *
 * The union above is the wire list; this is how code that has to *name* one
 * specific refusal names it. Derived from the union rather than restated, so
 * each code is spelled exactly once in the repo: server handlers, the SPA's
 * auth-failure classifier and its tests read this object instead of writing
 * the string a second time.
 */
export const ERROR_CODE = Object.fromEntries(
  ERROR_CODES.map((code) => [code, code] as const),
) as { readonly [K in ErrorCode]: K };

export interface ErrorBody {
  code: ErrorCode;
  message: string;
}

export type Envelope<T> =
  { success: true; data: T } | { success: false; error: ErrorBody };
