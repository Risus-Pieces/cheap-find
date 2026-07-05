import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../whataburger-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("whataburger parsers", () => {
  it("parses nearby stores with id, coords, address", () => {
    const stores = parseStores(fixture("whataburger-stores.json"));
    expect(stores.length).toBeGreaterThan(0);
    const s = stores[0];
    expect(s.id).toBe("525");
    expect(s.lat).toBeCloseTo(29.7913, 3);
    expect(s.lng).toBeCloseTo(-95.3732, 3);
    expect(s.address).toContain("Houston");
  });

  it("parses the Whataburger price from a store menu", () => {
    const r = parsePrice(fixture("whataburger-menu.json"));
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(5.69);
  });

  it("returns estimated fallback when no price is present", () => {
    const r = parsePrice({});
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(5.49);
  });
});
