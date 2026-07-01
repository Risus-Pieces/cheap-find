import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../tacobell-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("tacobell parsers", () => {
  it("parses nearby stores with id, coords, address", () => {
    const stores = parseStores(fixture("tacobell-stores.json"));
    expect(stores.length).toBeGreaterThan(0);
    const s = stores[0];
    expect(s.id).toBe("036215");
    expect(s.lat).toBeCloseTo(41.8764, 3);
    expect(s.lng).toBeCloseTo(-87.6289, 3);
    expect(s.address).toContain("Chicago");
  });

  it("parses the Crunchwrap Supreme price from a store menu", () => {
    const r = parsePrice(fixture("tacobell-menu-036215.json"));
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(8.49);
  });

  it("returns estimated when no matching item is present", () => {
    const r = parsePrice({ nothing: true });
    expect(r.isLive).toBe(false);
  });
});
