import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../wendys-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("wendys parsers", () => {
  it("parses nearby stores with id, numeric coords, address", () => {
    const stores = parseStores(fixture("wendys-stores.json"));
    const s = stores[0];
    expect(s.id).toBe("1206");
    expect(typeof s.lat).toBe("number");
    expect(s.lat).toBeCloseTo(41.9029, 2);
    expect(s.address).toContain("CHICAGO");
  });

  it("parses the Dave's Single price from a site menu", () => {
    const r = parsePrice(fixture("wendys-menu-1206.json"));
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(5.79);
  });

  it("returns estimated when no Dave's Single is present", () => {
    const r = parsePrice({ menuLists: [] });
    expect(r.isLive).toBe(false);
  });

  it("finds the price via tree-walk in a real-API-shaped nested menu", () => {
    const nested = {
      menuLists: {
        subMenus: [{ x: 1 }],
        salesItems: [
          { alaCarteMenuItemId: 1, displayName: "Dave's Single® Combo", price: 9.39 },
          { alaCarteMenuItemId: 2, displayName: "Dave's Single®", price: 5.99 },
        ],
      },
    };
    const r = parsePrice(nested);
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(5.99);
  });
});
