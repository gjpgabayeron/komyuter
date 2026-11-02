import { notFound, validationError, versionConflict } from "./errors";

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

/**
 * The refusal every versioned write shares (ADR-0020: "the check belongs in the
 * shared save helper rather than being repeated per route").
 *
 * The caller runs one compare-and-swap and hands over the rows it returned:
 * exactly one means the base matched. Zero means the row is gone or the base is
 * stale, and the current version decides which — a read is only paid on the
 * failure path.
 */
export async function versionedWrite<T>(
  rows: readonly T[],
  readCurrent: () => Promise<number | null>,
  missingMessage?: string,
): Promise<T> {
  if (rows.length > 0) return rows[0];

  const current = await readCurrent();
  if (current === null) {
    throw notFound(missingMessage ?? "Not found");
  }
  throw versionConflict(current);
}
