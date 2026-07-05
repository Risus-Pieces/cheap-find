import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../dominos-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("dominos parsers", () => {
  it("parses nearby stores with id, numeric coords, and Chicago address", () => {
    const stores = parseStores(fixture("dominos-stores.json"));
    expect(stores.length).toBeGreaterThan(0);
    const s = stores[0];
    expect(s.id).toBe("2791");
    expect(s.lat).toBeCloseTo(41.8912, 3);
    expect(s.lng).toBeCloseTo(-87.63678, 3);
    expect(s.address).toContain("Chicago");
    expect(s.name).toBe("Domino's #2791");
  });

  it("collapses newlines in AddressDescription to ', '", () => {
    const stores = parseStores(fixture("dominos-stores.json"));
    // AddressDescription has \n chars; address should not contain raw newlines
    expect(stores[0].address).not.toMatch(/\n/);
    expect(stores[0].address).toContain(", ");
  });

  it("parses the 12SCREEN price from a store menu", () => {
    const r = parsePrice(fixture("dominos-menu.json"));
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(14.99);
  });

  it("returns fallback when Variants is empty", () => {
    const r = parsePrice({ Variants: {} });
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(13.99);
  });

  it("returns fallback when Variants is missing entirely", () => {
    const r = parsePrice({});
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(13.99);
  });
});
