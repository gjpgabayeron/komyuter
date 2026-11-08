import { describe, expect, it } from "vitest";
import {
  plateSlotsFor,
  type PlateSlotInput,
} from "@/features/routes/workspace/plateSlots";

/**
 * Which plate lives where (ADR-0024).
 *
 * Two slots now: the context column (revealed over the free region's left edge)
 * and the right column. Results and Properties are mutually exclusive — the
 * search state's map width depends on it — and a confident single hit opens
 * neither, because the map and its popup are the answer. A query in flight is
 * already a session, so the loading plate opens too.
 */
describe("plateSlotsFor (which plate lives where)", () => {
  it("no session: properties on the right, no context column", () => {
    expect(
      plateSlotsFor({
        searchActive: false,
        loading: false,
        candidateCount: 0,
        hasStatus: false,
      }),
    ).toEqual({ context: "none", right: "properties" });
  });

  it("query in flight: the loading plate takes the context column", () => {
    expect(
      plateSlotsFor({
        searchActive: true,
        loading: true,
        candidateCount: 0,
        hasStatus: false,
      }),
    ).toEqual({ context: "search", right: "none" });
  });

  it("session with rows: results take the context column, properties yield", () => {
    expect(
      plateSlotsFor({
        searchActive: true,
        loading: false,
        candidateCount: 3,
        hasStatus: false,
      }),
    ).toEqual({ context: "search", right: "none" });
  });

  it("session that came back empty but explained: still the context column", () => {
    expect(
      plateSlotsFor({
        searchActive: true,
        loading: false,
        candidateCount: 0,
        hasStatus: true,
      }),
    ).toEqual({ context: "search", right: "none" });
  });

  it("confident single hit: no plate at all — the map and popup answer", () => {
    expect(
      plateSlotsFor({
        searchActive: true,
        loading: false,
        candidateCount: 0,
        hasStatus: false,
      }),
    ).toEqual({ context: "none", right: "none" });
  });

  it("never puts results and properties on screen together", () => {
    const sessions: PlateSlotInput[] = [
      {
        searchActive: true,
        loading: true,
        candidateCount: 0,
        hasStatus: false,
      },
      {
        searchActive: true,
        loading: false,
        candidateCount: 3,
        hasStatus: false,
      },
      {
        searchActive: true,
        loading: false,
        candidateCount: 0,
        hasStatus: true,
      },
      {
        searchActive: true,
        loading: false,
        candidateCount: 0,
        hasStatus: false,
      },
    ];
    for (const session of sessions) {
      const slots = plateSlotsFor(session);
      expect(slots.context === "search" && slots.right === "properties").toBe(
        false,
      );
    }
  });

  it("focus alone reveals nothing: an unfired field is not a session", () => {
    expect(
      plateSlotsFor({
        searchActive: true,
        loading: false,
        candidateCount: 0,
        hasStatus: false,
      }).context,
    ).toBe("none");
  });
});
