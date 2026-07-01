import type { ChainProvider, Store } from "./types";
import { parseStores, parsePrice } from "./chipotle-parse";

const BASE = "https://services.chipotle.com";
const KEY = "b4d9f36380184a3788857063bce25d6a";
const HEADERS = {
  "Ocp-Apim-Subscription-Key": KEY,
  "Content-Type": "application/json",
  Origin: "https://chipotle.com",
  Referer: "https://chipotle.com/order",
};

export const chipotle: ChainProvider = {
  id: "chipotle",
  name: "Chipotle",
  benchmarkItem: "Chicken Bowl",
  accentColor: "#A81612",
  fallbackPrice: 9.65,

  async findStores(lat, lng) {
    const res = await fetch(`${BASE}/restaurant/v3/restaurant`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
        radius: 9999,
        pageSize: 20,
        pageIndex: 0,
        embeds: { addressTypes: ["MAIN"] },
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Chipotle stores HTTP ${res.status}`);
    const stores: Store[] = parseStores(await res.json());
    // Dedupe by id
    const seen = new Set<string>();
    return stores.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  },

  async getPrice(storeId) {
    const res = await fetch(
      `${BASE}/menuinnovation/v1/restaurants/${storeId}/onlinemenu?channelId=web&includeUnavailableItems=false`,
      { headers: HEADERS, signal: AbortSignal.timeout(10_000), cache: "no-store" }
    );
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
