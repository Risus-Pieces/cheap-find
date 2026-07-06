import type { ChainProvider } from "./types";
import { parseStores, parsePrice } from "./wingstop-parse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const wingstop: ChainProvider = {
  id: "wingstop" as ChainProvider["id"],
  name: "Wingstop",
  benchmarkItem: "5 Classic Wings",
  accentColor: "#00573F",
  fallbackPrice: 6.99,

  async findStores(lat, lng) {
    const url = "https://ecomm.wingstop.com/location-worker?type=carryout";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ latitude: lat, longitude: lng, radius: 20, radiusUnits: "mi" }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Wingstop stores HTTP ${res.status}`);
    return parseStores(await res.json());
  },

  async getPrice(storeId) {
    const url = `https://ecomm.wingstop.com/menu-worker?locationId=${storeId}&serviceMode=carryout`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
