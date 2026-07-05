import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStoresHtml, parsePrice } from "../chilis-parse";

const fixture = (f: string) =>
  readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8");

const menuFixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("chilis parsers", () => {
  describe("parseStoresHtml", () => {
    it("parses stores with id, coords, address from SSR HTML", () => {
      const stores = parseStoresHtml(fixture("chilis-storelist.html"));
      expect(stores.length).toBe(3);
      const s = stores[0];
      expect(s.id).toBe("north-riverside");
      expect(s.lat).toBeCloseTo(41.850049, 4);
      expect(s.lng).toBeCloseTo(-87.8048, 4);
      expect(s.address).toContain("7225 W Cermak Rd.");
      expect(s.address).toContain("North Riverside");
    });

    it("returns empty array on malformed HTML (defensive)", () => {
      const stores = parseStoresHtml("<html>no flight data here</html>");
      expect(stores).toEqual([]);
    });

    it("returns empty array on empty string", () => {
      expect(parseStoresHtml("")).toEqual([]);
    });
  });

  describe("parsePrice", () => {
    it("finds Oldtimer with Cheese in Big Mouth Burgers, not the 3-For-Me combo", () => {
      const r = parsePrice(menuFixture("chilis-menu.json"));
      expect(r.isLive).toBe(true);
      expect(r.price).toBe(14.89);
    });

    it("returns isLive:false when no matching item is present", () => {
      const r = parsePrice({ categories: [] });
      expect(r.isLive).toBe(false);
    });

    it("skips items with null/zero cost", () => {
      const menu = {
        categories: [
          {
            name: "Big Mouth Burgers®",
            products: [
              { name: "Oldtimer® Burger W/ Cheese", cost: null },
              { name: "Oldtimer® Burger W/ Cheese", cost: 0 },
              { name: "Oldtimer® Burger W/ Cheese", cost: 14.99 },
            ],
          },
        ],
      };
      const r = parsePrice(menu);
      expect(r.isLive).toBe(true);
      expect(r.price).toBe(14.99);
    });

    it("prefers Big Mouth Burgers entry over 3-For-Me combo", () => {
      // The fixture already tests this but also verify with a synthetic case
      const menu = {
        categories: [
          {
            name: "3 For Me®",
            products: [{ name: "Oldtimer® Burger W/ Cheese", cost: 12.99 }],
          },
          {
            name: "Big Mouth Burgers®",
            products: [{ name: "Oldtimer® Burger W/ Cheese", cost: 14.89 }],
          },
        ],
      };
      const r = parsePrice(menu);
      expect(r.isLive).toBe(true);
      expect(r.price).toBe(14.89);
    });
  });
});
