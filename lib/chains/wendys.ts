import type { ChainProvider } from "./types";
import { parseStores, parsePrice } from "./wendys-parse";

const BASE = "https://digitalservices.prod.ext-aws.wendys.com";
const COMMON = "lang=en&cntry=US&sourceCode=ORDER.WENDYS&version=20.0.0";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const wendys: ChainProvider = {
  id: "wendys",
  name: "Wendy's",
  benchmarkItem: "Dave's Single",
  accentColor: "#E2203B",
  fallbackPrice: 6.29,

  async findStores(lat, lng) {
    const url = `${BASE}/LocationServices/rest/nearbyLocations?${COMMON}&lat=${lat}&long=${lng}&limit=25&filterSearch=false&radius=25`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Wendy's stores HTTP ${res.status}`);
    return parseStores(await res.json());
  },

  async getPrice(storeId) {
    const url = `${BASE}/menu/getSiteMenu?${COMMON}&siteNum=${storeId}&menuChannel=WEB_GUEST`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
