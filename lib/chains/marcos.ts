import type { ChainProvider } from "./types";
import { parseStoreList, nearestStores, parsePrice } from "./marcos-parse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const marcos: ChainProvider = {
  id: "marcos" as ChainProvider["id"],
  name: "Marco's Pizza",
  benchmarkItem: "Medium Pepperoni Magnifico",
  accentColor: "#00843D",
  fallbackPrice: 12.99,

  async findStores(lat, lng) {
    const res = await fetch("https://order.marcos.com/", {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Marco's store list HTTP ${res.status}`);
    const html = await res.text();
    const raw = parseStoreList(html);
    return nearestStores(raw, lat, lng, 20);
  },

  async getPrice(storeId) {
    const url = `https://momspublicstorage.blob.core.windows.net/content/moms/online/data/online-data-${storeId}.json`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
