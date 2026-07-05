import type { ChainProvider } from "./types";
import { parseStores, parsePrice } from "./whataburger-parse";

const API_KEY = "E08F3550-23FE-4360-BD6C-08314E6C3E2F";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const whataburger: ChainProvider = {
  id: "whataburger" as ChainProvider["id"],
  name: "Whataburger",
  benchmarkItem: "Whataburger",
  accentColor: "#FF5000",
  fallbackPrice: 5.49,

  async findStores(lat, lng) {
    const url = `https://api.whataburger.com/v2.4/locations/reverse_geocode?lat=${lat}&lng=${lng}`;
    const res = await fetch(url, {
      headers: { "x-api-key": API_KEY, "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Whataburger stores HTTP ${res.status}`);
    return parseStores(await res.json());
  },

  async getPrice(storeId) {
    const url = `https://api.whataburger.com/v2.4/locations/${storeId}/menu/child-recipes/33`;
    const res = await fetch(url, {
      headers: { "x-api-key": API_KEY, "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
