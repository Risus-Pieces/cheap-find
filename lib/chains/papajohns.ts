import type { ChainProvider, Store, PriceResult } from "./types";
import { parseStores, parsePrice } from "./papajohns-parse";
import { haversineDistance } from "../haversine";
import { withBrowserSession, type FetchJson } from "../scrape/browser";
import { kvGet, kvSet } from "../scrape/cache";

const ORIGIN = "https://www.papajohns.com/order/menu";
const TRPC = "https://www.papajohns.com/api/trpc";
const STORE_TTL = 3600; // 1h
const PRICE_TTL = 43200; // 12h — scraped prices change rarely
const PREWARM = 8; // price the nearest N stores in the same browser session

const storesKey = (lat: number, lng: number) =>
  `papajohns:stores:${lat.toFixed(2)},${lng.toFixed(2)}`;
const priceKey = (storeId: string) => `papajohns:price:${storeId}`;

function trpcInput(args: unknown): string {
  return encodeURIComponent(JSON.stringify({ json: args }));
}

async function searchStores(fetchJson: FetchJson, lat: number, lng: number): Promise<Store[]> {
  const data = await fetchJson(`${TRPC}/stores.getCarryoutStores`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { latitude: lat, longitude: lng } }),
  });
  return parseStores(data);
}

async function menuPrice(fetchJson: FetchJson, storeId: string): Promise<PriceResult> {
  const data = await fetchJson(
    `${TRPC}/product.getByStore?input=${trpcInput({ storeId: parseInt(storeId, 10) })}`
  );
  return parsePrice(data);
}

export const papajohns: ChainProvider = {
  id: "papajohns" as ChainProvider["id"],
  name: "Papa John's",
  benchmarkItem: "Large Pepperoni Pizza",
  accentColor: "#046A38",
  fallbackPrice: 14.99,

  async findStores(lat, lng) {
    const cached = await kvGet<Store[]>(storesKey(lat, lng));
    if (cached) return cached;

    const { data, ok } = await withBrowserSession(ORIGIN, async (fetchJson) => {
      const found = await searchStores(fetchJson, lat, lng);
      const nearest = found
        .map((s) => ({ s, d: haversineDistance(lat, lng, s.lat, s.lng) }))
        .sort((a, b) => a.d - b.d)
        .map((x) => x.s)
        .slice(0, 12);

      // Pre-warm prices for the closest stores in the same session so the UI's
      // progressive per-store price calls hit the cache instead of launching a browser each.
      for (const store of nearest.slice(0, PREWARM)) {
        try {
          const price = await menuPrice(fetchJson, store.id);
          await kvSet(priceKey(store.id), price, PRICE_TTL);
        } catch {
          /* skip a failed store, keep prewarming the rest */
        }
      }
      return nearest;
    });

    if (!ok || !data) return [];
    await kvSet(storesKey(lat, lng), data, STORE_TTL);
    return data;
  },

  async getPrice(storeId) {
    const cached = await kvGet<PriceResult>(priceKey(storeId));
    if (cached) return cached;

    const { data, ok } = await withBrowserSession(ORIGIN, async (fetchJson) =>
      menuPrice(fetchJson, storeId)
    );
    if (!ok || !data) return { price: this.fallbackPrice, isLive: false };
    await kvSet(priceKey(storeId), data, PRICE_TTL);
    return data;
  },
};
