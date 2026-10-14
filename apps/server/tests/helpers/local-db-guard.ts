/**
 * Safety rail for the destructive integration-test fixtures.
 *
 * `test-db.ts` drops and recreates a database on whichever host
 * `DATABASE_URL` names, and `sweepMainDatabaseStrays()` deletes rows from the
 * auth schema on the same host. Locally that host is the throwaway Supabase
 * stack; pointed at Supabase Cloud — which takes one careless paste into
 * `apps/server/.env` — the same code would wipe a real database.
 *
 * These helpers therefore refuse anything that is not loopback. The check is
 * deliberately a separate module with no imports and no side effects: it is
 * pure, unit-testable, and safe to load without a configured environment.
 */

/** Hostnames that mean "the local machine" for IPv4, IPv6 and name form. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class NonLocalDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonLocalDatabaseError";
  }
}

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return "";
  }
}

/**
 * True only when the connection string parses and points at loopback.
 *
 * A malformed string is NOT local: an unparseable URL has no verified host, and
 * this decides whether destructive work is allowed to proceed.
 */
export function isLocalDatabaseUrl(connectionString: string): boolean {
  return LOCAL_HOSTS.has(hostOf(connectionString).toLowerCase());
}

/**
 * Throws unless `connectionString` points at loopback.
 *
 * `context` names the caller so the failure says which fixture refused rather
 * than surfacing as an opaque connection error later.
 */
export function assertLocalDatabaseUrl(
  connectionString: string,
  context: string,
): void {
  if (isLocalDatabaseUrl(connectionString)) {
    return;
  }

  const host = hostOf(connectionString);
  throw new NonLocalDatabaseError(
    `${context} refused to run: DATABASE_URL points at ` +
      `${host ? `host "${host}"` : "an unparseable value"}, which is not local. ` +
      `The integration suite DROPS and recreates its test database and deletes ` +
      `auth users on this host, so it is only allowed to run against loopback ` +
      `(localhost / 127.0.0.1 / ::1). Point apps/server/.env at the local ` +
      `Supabase stack (127.0.0.1:54322) to run the suite, and keep Cloud ` +
      `credentials out of it.`,
  );
}
