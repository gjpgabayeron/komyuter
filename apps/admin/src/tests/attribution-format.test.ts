import { describe, expect, it } from "vitest";
import {
  formatAttributionName,
  NOT_RECORDED,
} from "@/features/routes/attribution";

/**
 * Attribution display (ADR-0025, ticket #45). The panel and the stop editor
 * both read a `{ userId, name } | null` value; this is the one pure function
 * that turns it into the string an admin reads.
 */
describe("attribution display", () => {
  it("names the Account that created or last wrote a row", () => {
    expect(formatAttributionName({ userId: "user-1", name: "Ada Reyes" })).toBe(
      "Ada Reyes",
    );
  });

  it("falls back to the Account id when the lookup has no name for it", () => {
    // A missing identity degrades to the id rather than to a blank cell.
    expect(formatAttributionName({ userId: "user-1", name: "" })).toBe(
      "user-1",
    );
    expect(formatAttributionName({ userId: "user-1", name: "   " })).toBe(
      "user-1",
    );
  });

  it("reads an unrecorded write as Not recorded rather than inventing an actor", () => {
    expect(NOT_RECORDED).toBe("Not recorded");
    expect(formatAttributionName(null)).toBe("Not recorded");
    // An unsaved draft stop carries no attribution at all.
    expect(formatAttributionName(undefined)).toBe("Not recorded");
  });
});
