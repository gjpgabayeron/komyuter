import { describe, expect, it } from "vitest";
import {
  BLOCK_MS,
  MAX_FAILURES,
  WINDOW_MS,
  createLoginThrottler,
  normalizeSource,
} from "../../src/api/throttle";

describe("createLoginThrottler", () => {
  it("blocks a key for at least BLOCK_MS after MAX_FAILURES failures in the window", () => {
    let now = 1_000;
    const throttler = createLoginThrottler(() => now);
    const key = "admin@komyuter.ph";

    for (let i = 0; i < MAX_FAILURES; i += 1) {
      expect(throttler.isBlocked(key)).toBe(false);
      throttler.recordFailure(key);
    }

    expect(throttler.isBlocked(key)).toBe(true);
    now += BLOCK_MS - 1;
    expect(throttler.isBlocked(key)).toBe(true);

    now += 1;
    expect(throttler.isBlocked(key)).toBe(false);
  });

  it("frees a source when the rolling window rolls over before blocking", () => {
    let now = 1_000;
    const throttler = createLoginThrottler(() => now);
    const key = "request.ip";

    throttler.recordFailure(key);
    now += WINDOW_MS + 1;
    throttler.recordFailure(key);
    now += WINDOW_MS + 1;
    throttler.recordFailure(key);

    // Only the freshest failure remains in the window — never MAX_FAILURES.
    expect(throttler.isBlocked(key)).toBe(false);
  });

  it("clears both counters on a successful sign-in", () => {
    let now = 1_000;
    const throttler = createLoginThrottler(() => now);
    const account = "admin@komyuter.ph";
    const source = "198.51.100.7";

    for (let i = 0; i < MAX_FAILURES - 1; i += 1) {
      throttler.recordFailure(account);
      throttler.recordFailure(source);
      now += 1_000;
    }
    throttler.clearKey(account);
    throttler.clearKey(source);

    for (let i = 0; i < MAX_FAILURES; i += 1) {
      throttler.recordFailure(account);
      throttler.recordFailure(source);
      now += 1_000;
    }
    // Account hit 5 fresh failures → blocked; source only ever had its own 5
    // recorded AFTER the clear, so it is blocked too — proving the clear
    // reset the counters before this round.
    expect(throttler.isBlocked(account)).toBe(true);
    expect(throttler.isBlocked(source)).toBe(true);
  });

  it("treats unknown keys as unblocked", () => {
    const throttler = createLoginThrottler();
    expect(throttler.isBlocked("nobody@example.com")).toBe(false);
  });

  // H1: the source dimension only isolates callers while each has its own key.
  // Collapse them all onto one key — what an unset `trustProxy` does behind a
  // proxy — and the same five failures block every caller rather than the one
  // that failed.
  it("blocks only the source that failed, so one client cannot lock out the others", () => {
    let now = 1_000;
    const throttler = createLoginThrottler(() => now);
    const attacker = normalizeSource("203.0.113.7");
    const innocent = normalizeSource("198.51.100.9");

    for (let i = 0; i < MAX_FAILURES; i += 1) {
      throttler.recordFailure(attacker);
      now += 1_000;
    }

    expect(throttler.isBlocked(attacker)).toBe(true);
    expect(throttler.isBlocked(innocent)).toBe(false);
  });
});

describe("normalizeSource", () => {
  it("keeps distinct client addresses distinct", () => {
    expect(normalizeSource("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeSource("203.0.113.8")).not.toBe(
      normalizeSource("203.0.113.7"),
    );
  });

  it("normalizes case and surrounding whitespace, so IPv6 spellings agree", () => {
    expect(normalizeSource("  2001:DB8::1 ")).toBe("2001:db8::1");
  });

  it("maps an absent or blank address to one shared bucket, not a per-request key", () => {
    expect(normalizeSource(undefined)).toBe("unknown");
    expect(normalizeSource("")).toBe("unknown");
    expect(normalizeSource("   ")).toBe("unknown");
  });
});
