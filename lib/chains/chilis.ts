import type { ChainProvider, Store } from "./types";
import { parseStoresHtml, parsePrice } from "./chilis-parse";
import { haversineDistance } from "../haversine";
import { reverseGeocode } from "../geo/reverse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bcounty\b/g, "") // "Cook County" → "cook"
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Fetch Chili's SSR locations page for a state/city slug. The page embeds the
 * ~20 nearest stores in Next.js React Server Components flight data.
 * Returns [] on any non-200 (e.g. no Chili's page for that city).
 */
async function fetchCityStores(
  stateSlug: string,
  citySlug: string
): Promise<Store[]> {
  if (!stateSlug || !citySlug) return [];
  const url = `https://www.chilis.com/locations/us/${stateSlug}/${citySlug}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) return []; // city page 404 → return empty, let caller handle
  const html = await res.text();
  return parseStoresHtml(html);
}

export const chilis: ChainProvider = {
  id: "chilis" as ChainProvider["id"],
  name: "Chili's",
  benchmarkItem: "Oldtimer with Cheese",
  accentColor: "#C8102E",
  fallbackPrice: 12.49,

  async findStores(lat, lng) {
    // Chili's has no lat/lng locator, so we resolve the city via a hardened
    // reverse-geocode (cached, non-throwing) and fetch that city's SSR page.
    const loc = await reverseGeocode(lat, lng);
    if (!loc) return []; // geocoding unavailable → "no locations", never a 500

    const stateSlug = toSlug(loc.stateName);
    // Try the city page first, then fall back to the county page (some stores
    // are filed under a broader locality than the reverse-geocoded city).
    let stores = await fetchCityStores(stateSlug, toSlug(loc.city));
    if (stores.length === 0 && loc.county) {
      stores = await fetchCityStores(stateSlug, toSlug(loc.county));
    }

    // The SSR page returns stores sorted by distance from the city center,
    // not necessarily our exact coordinates. Re-sort by haversine from user coords.
    stores = stores
      .map((s) => ({
        store: s,
        dist: haversineDistance(lat, lng, s.lat, s.lng),
      }))
      .sort((a, b) => a.dist - b.dist)
      .map(({ store }) => store);

    return stores.slice(0, 20);
  },

  async getPrice(storeId) {
    // storeId is the slug (e.g. "north-riverside")
    const url = `https://blue.chilis.com/api/v1/app/menus/${storeId}.json`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // Airport/limited stores return an empty categories array
    const hasItems = Array.isArray(data?.categories) && data.categories.length > 0;
    if (!hasItems) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(data);
  },
};
