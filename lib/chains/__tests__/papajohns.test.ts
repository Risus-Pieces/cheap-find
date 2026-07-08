import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../papajohns-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("papajohns parsers", () => {
  it("parses carryout stores with id, coords, address", () => {
    const stores = parseStores(fixture("papajohns-stores.json"));
    expect(stores.length).toBe(2);
    const s = stores[0];
    expect(s.id).toBe("4106");
    expect(s.lat).toBeCloseTo(41.85307, 4);
    expect(s.lng).toBeCloseTo(-87.62403, 4);
    expect(s.address).toContain("80 East Cermak Road");
    expect(s.address).toContain("Chicago");
  });

  it("parses the Large (14in) Pepperoni price and marks it cached, not live", () => {
    const before = Date.now();
    const r = parsePrice(fixture("papajohns-menu.json"));
    expect(r.price).toBe(13.99); // 14 Inch, not the 12 Inch decoy at 11.99
    expect(r.isLive).toBe(false);
    expect(r.cachedAt).toBeGreaterThanOrEqual(before);
  });

  it("falls back (no cachedAt) when the Large Pepperoni item is absent", () => {
    const r = parsePrice({ result: { data: { json: { products: [] } } } });
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(14.99);
    expect(r.cachedAt).toBeUndefined();
  });

  it("returns fallback on an unexpected shape", () => {
    const r = parsePrice({});
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(14.99);
  });
});
