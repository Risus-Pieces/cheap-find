import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../wingstop-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("wingstop parsers", () => {
  describe("parseStores", () => {
    it("parses locations with UUID id, coords, and address", () => {
      const stores = parseStores(fixture("wingstop-stores.json"));
      expect(stores.length).toBeGreaterThan(0);
      const s = stores[0];
      expect(s.id).toBe("a04bb466-059c-4367-9969-f2c0e7ad52c1");
      expect(s.lat).toBeCloseTo(41.8743097, 4);
      expect(s.lng).toBeCloseTo(-87.6264522, 4);
      expect(s.address).toContain("Chicago");
    });

    it("returns empty array when locations are missing", () => {
      expect(parseStores({})).toEqual([]);
    });

    it("skips locations without numeric latitude/longitude", () => {
      const stores = parseStores({
        data: {
          locations: [
            { id: "bad-1", name: "No Coords", streetAddress: "1 Main St", locality: "Nowhere", region: "TX" },
          ],
        },
      });
      expect(stores).toEqual([]);
    });
  });

  describe("parsePrice", () => {
    it("parses the 5 Classic Wings price from a store menu, not the Boneless decoy", () => {
      const r = parsePrice(fixture("wingstop-menu.json"));
      expect(r.isLive).toBe(true);
      expect(r.price).toBe(6.99);
    });

    it("returns fallback estimate when no matching item is present", () => {
      const r = parsePrice({});
      expect(r.isLive).toBe(false);
      expect(r.price).toBe(6.99);
    });

    it("returns fallback estimate when menu has categories but no 5 Classic Wings item", () => {
      const r = parsePrice({
        data: {
          categories: [
            {
              name: "Add Ons",
              products: [{ item: { name: "5 Boneless Wings", price: 3.79 } }],
            },
          ],
        },
      });
      expect(r.isLive).toBe(false);
      expect(r.price).toBe(6.99);
    });
  });
});
