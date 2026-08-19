/**
 * In-memory login throttling (ADR-0005): per-account AND per-source fixed
 * windows. Five failures within WINDOW_MS block the key for BLOCK_MS. A
 * successful sign-in clears both the account and the source counters.
 *
 * Keys are normalized (account = lowercased email, source = request IP).
 * State lives only in memory of this process — acceptable for the admin
 * panel's single-instance deployment; a multi-instance setup would need a
 * shared store (Redis/Postgres).
 */

export const MAX_FAILURES = 5;
export const WINDOW_MS = 5 * 60_000;
export const BLOCK_MS = 15 * 60_000;
/** Uniform denial delay applied by the login route (denials are indistinguishable). */
export const DENIAL_MIN_MS = 250;

export function normalizeAccount(email: string): string {
  return email.trim().toLowerCase();
}

interface ThrottleEntry {
  failures: number[];
  blockedUntil: number;
}

export interface LoginThrottler {
  isBlocked(key: string): boolean;
  recordFailure(key: string): void;
  clearKey(key: string): void;
}

export function createLoginThrottler(
  now: () => number = Date.now,
): LoginThrottler {
  const entries = new Map<string, ThrottleEntry>();

  function pruneFailures(entry: ThrottleEntry, t: number): void {
    const cutoff = t - WINDOW_MS;
    entry.failures = entry.failures.filter((ts) => ts >= cutoff);
    if (entry.blockedUntil > 0 && t >= entry.blockedUntil) {
      entry.blockedUntil = 0;
    }
  }

  return {
    isBlocked(key) {
      const entry = entries.get(key);
      if (!entry) return false;
      const t = now();
      // An active block wins over the rolling window: it lasts the full
      // BLOCK_MS even though the underlying failures fall out of the window.
      if (entry.blockedUntil > t) return true;
      pruneFailures(entry, t);
      if (entry.failures.length === 0) {
        entries.delete(key);
        return false;
      }
      return false;
    },

    recordFailure(key) {
      const t = now();
      const entry = entries.get(key) ?? { failures: [], blockedUntil: 0 };
      pruneFailures(entry, t);
      entry.failures.push(t);
      if (entry.failures.length >= MAX_FAILURES) {
        entry.blockedUntil = entry.failures[0] + BLOCK_MS;
      }
      entries.set(key, entry);
    },

    clearKey(key) {
      entries.delete(key);
    },
  };
}
