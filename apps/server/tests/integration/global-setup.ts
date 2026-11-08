import { captureBaselineState, restoreBaselineState } from "./helpers";
import {
  destroyTestDatabase,
  recreateTestDatabase,
  sweepMainDatabaseStrays,
} from "./test-db";

/**
 * Runs once before the integration suite: recreates the dedicated test
 * database (`komyuter_test`) with the current migrations, sweeps stale auth
 * strays from the MAIN database (leftovers of previously interrupted runs),
 * then snapshots the ids the suite can write to. The teardown (vitest's
 * globalSetup contract) restores the databases to exactly that baseline and
 * DROPS the test database — after testing, its pool is destroyed and the
 * live dev database is untouched by CRUD data.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  await recreateTestDatabase();
  await sweepMainDatabaseStrays();
  const baseline = await captureBaselineState();
  return async () => {
    await restoreBaselineState(baseline);
    await destroyTestDatabase();
  };
}
