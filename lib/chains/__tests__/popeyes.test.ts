import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../popeyes-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("popeyes parsers", () => {
  it("parses nearby stores with id, coords, address", () => {
    const stores = parseStores(fixture("popeyes-stores.json"));
    expect(stores.length).toBeGreaterThan(0);
    const s = stores[0];
    expect(s.id).toBe("13060");
    expect(s.lat).toBeCloseTo(41.88483, 3);
    expect(s.lng).toBeCloseTo(-87.626489, 3);
    expect(s.address).toContain("Chicago");
  });

  it("parses the Classic Chicken Sandwich price from a store menu", () => {
    const r = parsePrice(fixture("popeyes-menu.json"));
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(6.29);
  });

  it("returns estimated fallback when item_101929 is absent", () => {
    const r = parsePrice({ data: { storeMenu: [{ id: "item_999", price: { default: 500 } }] } });
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(5.49);
  });

  it("returns estimated fallback when item_101929 has price.default 0", () => {
    const r = parsePrice({ data: { storeMenu: [{ id: "item_101929", price: { default: 0 } }] } });
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(5.49);
  });
});
