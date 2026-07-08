import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../subway-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("subway parsers", () => {
  it("parses stores with id, coords, address", () => {
    const stores = parseStores(fixture("subway-stores.json"));
    expect(stores.length).toBe(4);
    const s = stores[0];
    expect(s.id).toBe("26771-0");
    expect(s.lat).toBeCloseTo(41.8767201, 5);
    expect(s.lng).toBeCloseTo(-87.628954, 5);
    expect(s.address).toContain("35 W Van Buren St.");
    expect(s.address).toContain("Chicago");
  });

  it("parses the Footlong Italian B.M.T. price and marks it cached, not live", () => {
    const before = Date.now();
    const r = parsePrice(fixture("subway-menu.json"));
    expect(r.price).toBe(11.89); // Footlong size, not the 6'' decoy at 7.79
    expect(r.isLive).toBe(false);
    expect(r.cachedAt).toBeGreaterThanOrEqual(before);
  });

  it("falls back (no cachedAt) when the B.M.T. is absent", () => {
    const r = parsePrice({ categories: [] });
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(9.49);
    expect(r.cachedAt).toBeUndefined();
  });

  it("returns fallback on an unexpected shape", () => {
    const r = parsePrice({});
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(9.49);
  });
});
