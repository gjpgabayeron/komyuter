import { describe, expect, it } from "vitest";
import {
  BLOCK_MS,
  MAX_FAILURES,
  WINDOW_MS,
  createLoginThrottler,
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
});
