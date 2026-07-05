import type { ChainProvider, Store } from "./types";
import { parseStoresHtml, parsePrice } from "./chilis-parse";
import { haversineDistance } from "../haversine";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/**
 * Reverse-geocode lat/lng via Nominatim to get state + city slugs,
 * then fetch Chili's SSR locations page which embeds the 20 nearest stores
 * in Next.js React Server Components flight data.
 */
async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ stateSlug: string; citySlug: string }> {
  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=json&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "FastFind/1.0 (fast food price comparison app)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Nominatim reverse HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const addr = data?.address ?? {};
  // Prefer city, then town, then municipality, then village
  const city: string =
    addr.city ?? addr.town ?? addr.municipality ?? addr.village ?? "";
  const state: string = addr.state ?? "";
  if (!city || !state) throw new Error("Nominatim: no city/state in response");

  const toSlug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
  return { stateSlug: toSlug(state), citySlug: toSlug(city) };
}

async function fetchCityStores(
  stateSlug: string,
  citySlug: string
): Promise<Store[]> {
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
    const { stateSlug, citySlug } = await reverseGeocode(lat, lng);
    let stores = await fetchCityStores(stateSlug, citySlug);

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
