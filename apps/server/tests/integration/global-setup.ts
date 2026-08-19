import { captureBaselineState, restoreBaselineState } from "./helpers";

/**
 * Runs once before the integration suite: snapshots the ids the suite can
 * write to (routes, fare configs, test auth users). Returns the teardown
 * (vitest's globalSetup contract) which restores the database to exactly that
 * baseline afterwards — test data never persists into dev/staging.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const baseline = await captureBaselineState();
  return async () => {
    await restoreBaselineState(baseline);
  };
}
