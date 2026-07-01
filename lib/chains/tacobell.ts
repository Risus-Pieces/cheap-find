import type { ChainProvider } from "./types";
import { parseStores, parsePrice } from "./tacobell-parse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const tacobell: ChainProvider = {
  id: "tacobell",
  name: "Taco Bell",
  benchmarkItem: "Crunchwrap Supreme",
  accentColor: "#702082",
  fallbackPrice: 6.49,

  async findStores(lat, lng) {
    const url = `https://www.tacobell.com/tacobellwebservices/v4/tacobell/stores?latitude=${lat}&longitude=${lng}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Taco Bell stores HTTP ${res.status}`);
    return parseStores(await res.json());
  },

  async getPrice(storeId) {
    const url = `https://www.tacobell.com/tacobellwebservices/v2/tacobell/products/menu/${storeId}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
