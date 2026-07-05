import type { ChainProvider } from "./types";
import { parseStores, parsePrice } from "./dominos-parse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const NOMINATIM_UA = "FastFind/1.0 (fast food price comparison app)";

/** Reverse-geocode lat/lng → "City,State,PostalCode" string for Domino's locator. */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Nominatim reverse geocode HTTP ${res.status}`);
  const data = await res.json();
  const addr = data?.address ?? {};
  const city = addr.city ?? addr.town ?? addr.village ?? "";
  // ISO3166-2-lvl4 is "US-IL" — extract state abbreviation
  const stateRaw: string = addr["ISO3166-2-lvl4"] ?? "";
  const state = stateRaw.replace(/^[A-Z]+-/, ""); // "US-IL" → "IL"
  const postal = addr.postcode ?? "";
  return [city, state, postal].filter(Boolean).join(",");
}

export const dominos: ChainProvider = {
  id: "dominos" as ChainProvider["id"],
  name: "Domino's",
  benchmarkItem: "Medium Hand Tossed Pizza",
  accentColor: "#0B6EB4",
  fallbackPrice: 13.99,

  async findStores(lat, lng) {
    // Domino's locator requires a city/postal string — reverse-geocode first.
    let cityParam: string;
    try {
      cityParam = await reverseGeocode(lat, lng);
    } catch {
      // If reverse geocode fails, attempt with empty city (will likely return empty stores)
      cityParam = "";
    }

    const url =
      `https://order.dominos.com/power/store-locator` +
      `?type=Carryout&c=${encodeURIComponent(cityParam)}&latlng=${lat},${lng}`;

    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Domino's stores HTTP ${res.status}`);
    return parseStores(await res.json());
  },

  async getPrice(storeId) {
    const url = `https://order.dominos.com/power/store/${storeId}/menu?lang=en&structured=true`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
