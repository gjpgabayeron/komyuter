import { describe, expect, it } from "vitest";
import type { ExpressionSpecification } from "maplibre-gl";
import {
  OVERVIEW_FADE_MS,
  fadeLineLayers,
  fadeOutLayers,
  overviewOpacityAt,
} from "@/lib/overviewFade";

/** The shared base expression the helper scales (hover/focus-aware). */
const BASE: ExpressionSpecification = [
  "case",
  ["==", ["feature-state", "hovered"], true],
  1,
  ["==", ["feature-state", "focused"], true],
  1,
  ["coalesce", ["feature-state", "dim"], 1],
];

describe("overviewOpacityAt", () => {
  it("returns the identity expression at factor 1", () => {
    expect(overviewOpacityAt(1)).toEqual(BASE);
  });

  it("returns the scaled expression at intermediate factors", () => {
    expect(overviewOpacityAt(0.5)).toEqual(["*", BASE, 0.5]);
    expect(overviewOpacityAt(0)).toEqual(["*", BASE, 0]);
  });

  it("clamps out-of-range factors", () => {
    expect(overviewOpacityAt(2)).toEqual(BASE);
    expect(overviewOpacityAt(-1)).toEqual(["*", BASE, 0]);
  });
});

describe("OVERVIEW_FADE_MS", () => {
  it("is a positive, sub-second duration (subtle fade)", () => {
    expect(OVERVIEW_FADE_MS).toBeGreaterThan(0);
    expect(OVERVIEW_FADE_MS).toBeLessThanOrEqual(500);
  });
});

describe("fadeLineLayers", () => {
  it("steps line-opacity from 0 to 1 and stops (no oscillation)", () => {
    // Stub rAF to run one frame per call with a synthetic clock.
    let now = 0;
    const rafs: Array<(t: number) => void> = [];
    globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
      rafs.push(cb);
      return rafs.length;
    }) as typeof requestAnimationFrame;
    globalThis.performance = {
      now: () => now,
    } as Performance;

    const calls: number[] = [];
    const map = {
      getLayer: (id: string) => id === "route-line-draft",
      getPaintProperty: () => 1,
      getStyle: () => ({}),
      setPaintProperty: (_id: string, _prop: string, value: number) => {
        calls.push(value);
      },
    } as unknown as import("maplibre-gl").Map;

    fadeLineLayers(
      map,
      [{ id: "route-line-draft", prop: "line-opacity" }],
      100,
    );
    // Frame 1 at t=0 → opacity 0; then step time forward per frame.
    const drain = () => {
      while (rafs.length) {
        const cb = rafs.shift()!;
        now += 30;
        cb(now);
      }
    };
    drain();
    // Rises monotonically from below 1 toward exactly 1 (frames at 30ms steps
    // over a 100ms fade: 0.3, 0.6, 0.9, then 1), then the animation stops.
    expect(calls[0]).toBeLessThan(1);
    expect(calls.every((v, i) => i === 0 || v >= calls[i - 1])).toBe(true);
    expect(calls[calls.length - 1]).toBe(1);
    // The animation stopped: no more frames are scheduled after opacity hits 1.
    expect(rafs).toHaveLength(0);
    expect(OVERVIEW_FADE_MS).toBeGreaterThan(0);
  });
});

describe("fadeOutLayers", () => {
  it("steps opacity from 1 down to 0, then calls onDone once", () => {
    let now = 0;
    const rafs: Array<(t: number) => void> = [];
    globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
      rafs.push(cb);
      return rafs.length;
    }) as typeof requestAnimationFrame;
    globalThis.performance = { now: () => now } as Performance;

    const calls: number[] = [];
    let done = 0;
    const map = {
      getLayer: (id: string) => id === "route-line-draft",
      getPaintProperty: () => 1,
      getStyle: () => ({}),
      setPaintProperty: (_id: string, _prop: string, value: number) => {
        calls.push(value);
      },
    } as unknown as import("maplibre-gl").Map;

    fadeOutLayers(
      map,
      [{ id: "route-line-draft", prop: "line-opacity" }],
      100,
      () => {
        done += 1;
      },
    );
    while (rafs.length) {
      const cb = rafs.shift()!;
      now += 30;
      cb(now);
    }
    // Starts below 1, falls monotonically to exactly 0, then stops.
    expect(calls[0]).toBeLessThanOrEqual(1);
    expect(calls.every((v, i) => i === 0 || v <= calls[i - 1])).toBe(true);
    expect(calls[calls.length - 1]).toBe(0);
    expect(done).toBe(1);
    expect(rafs).toHaveLength(0);
  });
});

describe("fadeOutLayers cancel", () => {
  it("aborts the fade when cancelled (no onDone, no further writes)", () => {
    let now = 0;
    const rafs: Array<(t: number) => void> = [];
    globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
      rafs.push(cb);
      return rafs.length;
    }) as typeof requestAnimationFrame;
    globalThis.performance = { now: () => now } as Performance;

    const calls: number[] = [];
    let done = 0;
    const map = {
      getLayer: (id: string) => id === "route-line-draft",
      getPaintProperty: () => 1,
      getStyle: () => ({}),
      setPaintProperty: (_id: string, _prop: string, value: number) => {
        calls.push(value);
      },
    } as unknown as import("maplibre-gl").Map;

    const cancel = fadeOutLayers(
      map,
      [{ id: "route-line-draft", prop: "line-opacity" }],
      100,
      () => {
        done += 1;
      },
    );
    // Run a couple of frames, then cancel.
    now += 30;
    rafs.shift()?.(now);
    now += 30;
    rafs.shift()?.(now);
    cancel();
    while (rafs.length) rafs.shift()!(now);
    expect(done).toBe(0);
    // Only the two pre-cancel frames wrote opacity.
    expect(calls).toHaveLength(2);
  });
});
