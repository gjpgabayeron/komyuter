import { describe, expect, it } from "vitest";
import type { GeocodeHit } from "@komyuter/shared";
import {
  isConfident,
  normalisePlaceName,
} from "@/features/routes/poiConfidence";

function hit(name: string): GeocodeHit {
  return {
    id: name,
    name,
    description: "Iloilo City",
    location: [122.56, 10.72],
  };
}

describe("normalisePlaceName", () => {
  it("folds case, punctuation, accents and whitespace", () => {
    expect(normalisePlaceName("  Jaro   Plaza! ")).toBe("jaro plaza");
    expect(normalisePlaceName("JARO PLAZA")).toBe("jaro plaza");
    expect(normalisePlaceName("Jaro-Plaza")).toBe("jaro plaza");
    expect(normalisePlaceName("Iloílo City")).toBe("iloilo city");
  });
});

describe("isConfident", () => {
  it("is never confident about an empty answer", () => {
    expect(isConfident("Jaro Plaza", [])).toBe(false);
  });

  it("is confident when there is exactly one hit", () => {
    expect(isConfident("sm city", [hit("SM City Iloilo")])).toBe(true);
  });

  it("is confident when the top name is the query", () => {
    expect(
      isConfident("jaro plaza", [
        hit("Jaro Plaza"),
        hit("Jaro Plaza Dancing Fountain"),
      ]),
    ).toBe(true);
  });

  it("is not confident when the top hit is merely related", () => {
    expect(
      isConfident("city hall", [
        hit("Iloilo City Hall"),
        hit("Iloilo City Hall Parking Building"),
      ]),
    ).toBe(false);
  });

  it("is not confident when the top hit is a different place", () => {
    expect(
      isConfident("Jaro Plaza", [
        hit("Graciano Lopez Jaena Park"),
        hit("Jaro Belfry"),
      ]),
    ).toBe(false);
  });

  it("is not confident on a blank query", () => {
    expect(isConfident("   ", [hit("Jaro Plaza"), hit("Jaro Belfry")])).toBe(
      false,
    );
  });
});
