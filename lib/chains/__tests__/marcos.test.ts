import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStoreList, nearestStores, parsePrice } from "../marcos-parse";

const FIXTURES = join(__dirname, "../../../test-fixtures");

const fixtureHtml = () =>
  readFileSync(join(FIXTURES, "marcos-storelist.html"), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixtureMenu = (): any =>
  JSON.parse(readFileSync(join(FIXTURES, "marcos-menu.json"), "utf8"));

describe("marcos parseStoreList", () => {
  it("extracts 3 raw stores from fixture HTML", () => {
    const raw = parseStoreList(fixtureHtml());
    expect(raw).toHaveLength(3);
  });

  it("each raw store has SKEY, LAT, LON", () => {
    const raw = parseStoreList(fixtureHtml());
    for (const s of raw) {
      expect(typeof s.SKEY).toBe("string");
      expect(s.SKEY.length).toBeGreaterThan(0);
      expect(typeof s.LAT).toBe("number");
      expect(typeof s.LON).toBe("number");
    }
  });

  it("first store is LPPPLA in Parma OH", () => {
    const raw = parseStoreList(fixtureHtml());
    expect(raw[0].SKEY).toBe("LPPPLA");
    expect(raw[0].CITY).toBe("Parma");
    expect(raw[0].STA).toBe("OH");
  });

  it("returns [] for HTML with no locations key", () => {
    expect(parseStoreList("<html><body>no data</body></html>")).toEqual([]);
  });
});

describe("marcos nearestStores", () => {
  it("returns Store[] sorted by distance, id===SKEY, address contains city", () => {
    const raw = parseStoreList(fixtureHtml());
    // Use coords near Parma OH — LPPPLA should be nearest
    const stores = nearestStores(raw, 41.4, -81.7, 20);
    expect(stores.length).toBe(3);
    expect(stores[0].id).toBe("LPPPLA");
    expect(typeof stores[0].lat).toBe("number");
    expect(typeof stores[0].lng).toBe("number");
    expect(stores[0].address).toContain("Parma");
  });

  it("caps results at limit even when more stores available", () => {
    // Synthesize 25 fake stores all at the same lat/lng as the query
    const lat = 40.0;
    const lng = -80.0;
    const fakeRaw = Array.from({ length: 25 }, (_, i) => ({
      SID: i,
      SKEY: `KEY${String(i).padStart(3, "0")}`,
      LAT: lat + i * 0.01,
      LON: lng,
      NAM: "Marco's Pizza",
      ADD1: `${i} Main St`,
      ADD2: "",
      CITY: "Testville",
      STA: "OH",
      ZIP: "40000",
    }));

    const stores = nearestStores(fakeRaw, lat, lng, 20);
    expect(stores).toHaveLength(20);
    // Closest should be index 0 (smallest lat offset)
    expect(stores[0].id).toBe("KEY000");
  });

  it("uses SKEY as store id", () => {
    const raw = parseStoreList(fixtureHtml());
    const stores = nearestStores(raw, 41.4, -81.7, 20);
    expect(stores[0].id).toBe("LPPPLA");
  });
});

describe("marcos parsePrice", () => {
  it("extracts Medium Pepperoni Magnifico price from fixture", () => {
    const r = parsePrice(fixtureMenu());
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(14.99);
  });

  it("returns the fallback price (not 0) when ITMS is empty", () => {
    const r = parsePrice({ ITMS: [] });
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(12.99);
  });

  it("returns isLive:false when IID 12 is missing", () => {
    const r = parsePrice({ ITMS: [{ IID: 99, PRCS: [] }] });
    expect(r.isLive).toBe(false);
  });

  it("returns the fallback price (not 0) when SZID 2 is missing", () => {
    const r = parsePrice({ ITMS: [{ IID: 12, PRCS: [{ SZID: 1, PRC: 9.99 }] }] });
    expect(r.isLive).toBe(false);
    expect(r.price).toBe(12.99);
  });

  it("returns isLive:false for completely empty input", () => {
    const r = parsePrice({});
    expect(r.isLive).toBe(false);
  });

  it("uses first valid SZID=2 entry when duplicates exist", () => {
    // The real API has duplicate SZID=2 entries — we want the first positive one
    const menu = {
      ITMS: [
        {
          IID: 12,
          PRCS: [
            { SZID: 2, PRC: 14.99 },
            { SZID: 2, PRC: 14.99 },
          ],
        },
      ],
    };
    const r = parsePrice(menu);
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(14.99);
  });
});
