import { validationError } from "./errors";

/**
 * The version a delete is based on (ADR-0020). Deletes carry it in the query
 * string; a missing or malformed value is a validation refusal rather than an
 * implied fresh base, because a delete with no base is last-write-wins.
 */
export function requireBaseVersion(query: unknown): number {
  const raw = (query as { base_version?: unknown } | undefined)?.base_version;
  const parsed = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw validationError("base_version is required");
  }
  return parsed;
}
