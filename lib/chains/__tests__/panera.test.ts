import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../panera-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("panera parsers", () => {
  it("parses cafes with id, coords, address", () => {
    const stores = parseStores(fixture("panera-stores.json"));
    expect(stores.length).toBe(3);
    const s = stores[0];
    expect(s.id).toBe("606477");
    expect(s.lat).toBeCloseTo(41.885086, 4);
    expect(s.lng).toBeCloseTo(-87.628179, 4);
    expect(s.address).toContain("168 N State St");
    expect(s.address).toContain("Chicago");
  });

  it("parses the Broccoli Cheddar Soup bowl price and marks it cached, not live", () => {
    const before = Date.now();
    const r = parsePrice(fixture("panera-menu.json"));
    expect(r.price).toBe(8.99); // bowl size, not the cup decoy at 5.49
    expect(r.isLive).toBe(false);
    expect(r.cachedAt).toBeGreaterThanOrEqual(before);
  });

  it("falls back (no cachedAt) when the Broccoli Cheddar Soup bowl is absent", () => {
    const r = parsePrice({ placards: {} });
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(8.19);
    expect(r.cachedAt).toBeUndefined();
  });

  it("returns fallback on an unexpected shape", () => {
    const r = parsePrice({});
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(8.19);
  });
});
