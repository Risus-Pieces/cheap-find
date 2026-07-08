import type { ChainProvider } from "./types";
import { parseStores, parsePrice } from "./dominos-parse";
import { reverseGeocode } from "../geo/reverse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const dominos: ChainProvider = {
  id: "dominos" as ChainProvider["id"],
  name: "Domino's",
  benchmarkItem: "Medium Hand Tossed Pizza",
  accentColor: "#0B6EB4",
  fallbackPrice: 13.99,

  async findStores(lat, lng) {
    // Domino's locator requires a city/postal string — reverse-geocode first.
    // reverseGeocode never throws; on failure loc is null and we fall back to
    // an empty city param (the locator then returns no stores, handled cleanly).
    const loc = await reverseGeocode(lat, lng);
    const cityParam = loc
      ? [loc.city, loc.stateAbbr, loc.postcode].filter(Boolean).join(",")
      : "";

    const url =
      `https://order.dominos.com/power/store-locator` +
      `?type=Carryout&c=${encodeURIComponent(cityParam)}&latlng=${lat},${lng}`;

    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Domino's stores HTTP ${res.status}`);
    return parseStores(await res.json());
  },

  async getPrice(storeId) {
    const url = `https://order.dominos.com/power/store/${storeId}/menu?lang=en&structured=true`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
