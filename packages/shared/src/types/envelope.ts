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

export interface ErrorBody {
  code: ErrorCode;
  message: string;
}

export type Envelope<T> =
  { success: true; data: T } | { success: false; error: ErrorBody };
