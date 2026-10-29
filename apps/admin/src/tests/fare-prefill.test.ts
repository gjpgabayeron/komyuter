import { describe, expect, it } from "vitest";
import { resolveFareSelection } from "@/features/routes/farePrefill";

const standard = { fare_config_id: "fc-standard", is_default: false };
const provincial = { fare_config_id: "fc-provincial", is_default: true };

describe("resolveFareSelection", () => {
  it("selects the default configuration when the admin has not chosen", () => {
    expect(
      resolveFareSelection([standard, provincial], {
        touched: false,
        currentId: null,
      }),
    ).toBe("fc-provincial");
  });

  it("returns null when no configuration is the default", () => {
    expect(
      resolveFareSelection([standard], { touched: false, currentId: null }),
    ).toBeNull();
  });

  it("returns null while the list is still loading", () => {
    expect(
      resolveFareSelection(undefined, { touched: false, currentId: null }),
    ).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(
      resolveFareSelection([], { touched: false, currentId: null }),
    ).toBeNull();
  });

  it("keeps a selection the admin made, even across a query refetch", () => {
    expect(
      resolveFareSelection([standard, provincial], {
        touched: true,
        currentId: "fc-standard",
      }),
    ).toBe("fc-standard");
  });

  it("keeps a deliberate 'No fare config' pick instead of falling back to the default", () => {
    expect(
      resolveFareSelection([standard, provincial], {
        touched: true,
        currentId: null,
      }),
    ).toBeNull();
  });

  it("keeps a freshly created non-default configuration selected", () => {
    const created = { fare_config_id: "fc-created", is_default: false };
    expect(
      resolveFareSelection([created, standard, provincial], {
        touched: true,
        currentId: "fc-created",
      }),
    ).toBe("fc-created");
  });

  it("uses the first default when the list unexpectedly holds more than one", () => {
    const other = { fare_config_id: "fc-other", is_default: true };
    expect(
      resolveFareSelection([provincial, other], {
        touched: false,
        currentId: null,
      }),
    ).toBe("fc-provincial");
  });
});
