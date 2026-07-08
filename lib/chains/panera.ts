import type { ChainProvider, Store, PriceResult } from "./types";
import { parseStores, parsePrice } from "./panera-parse";
import { haversineDistance } from "../haversine";
import { withBrowserSession, type FetchJson } from "../scrape/browser";
import { kvGet, kvSet } from "../scrape/cache";

const ORIGIN = "https://www.panerabread.com/en-us/cafe-locator.html";
const API = "https://www-api.panerabread.com/www-api/public";
const STORE_TTL = 3600; // 1h
const PRICE_TTL = 43200; // 12h — scraped prices change rarely
const PREWARM = 8; // price the nearest N cafes in the same browser session

const storesKey = (lat: number, lng: number) =>
  `panera:stores:${lat.toFixed(2)},${lng.toFixed(2)}`;
const priceKey = (storeId: string) => `panera:price:${storeId}`;

async function searchCafes(fetchJson: FetchJson, lat: number, lng: number): Promise<Store[]> {
  const data = await fetchJson(`${API}/cafe/search?openCafes=true&locale=en-US`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ latitude: lat, longitude: lng }),
  });
  return parseStores(data);
}

/**
 * Panera's menu is versioned per cafe (mnavPlacard / mnavPlacardSchedule ids from
 * /public/menu/versions/{cafeId}), then the placards themselves are fetched with
 * those version ids in the URL. Both calls run in-session so Akamai stays cleared.
 * Confirmed live 2026-07-08: per-cafe pricing genuinely varies (Chicago bowl $8.99
 * vs LA bowl $9.59), so this is not just the national menu re-fetched per store.
 */
async function menuPrice(fetchJson: FetchJson, cafeId: string): Promise<PriceResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const versions: any = await fetchJson(`${API}/menu/versions/${cafeId}`);
  const placardVersion = versions?.versions?.mnavPlacard;
  const scheduleVersion = versions?.versions?.mnavPlacardSchedule;
  if (!placardVersion || !scheduleVersion) {
    // No version info back — parsePrice({}) falls back cleanly.
    return parsePrice(null);
  }
  const data = await fetchJson(
    `${API}/menu/placards/${cafeId}/version/${placardVersion}/${scheduleVersion}/en-US?cloud=false`
  );
  return parsePrice(data);
}

export const panera: ChainProvider = {
  id: "panera",
  name: "Panera Bread",
  benchmarkItem: "Broccoli Cheddar Soup",
  accentColor: "#6C7A3A",
  fallbackPrice: 8.19,

  async findStores(lat, lng) {
    const cached = await kvGet<Store[]>(storesKey(lat, lng));
    if (cached) return cached;

    const { data, ok } = await withBrowserSession(ORIGIN, async (fetchJson) => {
      const found = await searchCafes(fetchJson, lat, lng);
      const nearest = found
        .map((s) => ({ s, d: haversineDistance(lat, lng, s.lat, s.lng) }))
        .sort((a, b) => a.d - b.d)
        .map((x) => x.s)
        .slice(0, 12);

      // Pre-warm prices for the closest cafes in the same session so the UI's
      // progressive per-store price calls hit the cache instead of launching a browser each.
      for (const store of nearest.slice(0, PREWARM)) {
        try {
          const price = await menuPrice(fetchJson, store.id);
          // Only cache a real scraped price; never pin a fallback estimate.
          if (price.cachedAt) await kvSet(priceKey(store.id), price, PRICE_TTL);
        } catch {
          /* skip a failed cafe, keep prewarming the rest */
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
    // Only cache a real scraped price; a parse miss returns a fallback we don't pin.
    if (data.cachedAt) await kvSet(priceKey(storeId), data, PRICE_TTL);
    return data;
  },
};
