import { TTLCache } from "../cache";

/**
 * A resolved locality from reverse-geocoding. Any string field may be empty
 * except that at least one of {city, county} and a state are present when the
 * result is non-null.
 */
export interface Locality {
  city: string;
  county: string;
  stateName: string;
  stateAbbr: string;
  postcode: string;
}

const NOMINATIM_UA = "FastFind/1.0 (fast food price comparison app)";
const CACHE_TTL = 30 * 60 * 1_000; // 30 min — localities are stable
let cache = new TTLCache<Locality>(CACHE_TTL);

/** Test-only: reset the module cache between cases. */
export function _clearReverseCache() {
  cache = new TTLCache<Locality>(CACHE_TTL);
}

/**
 * Pure parser: extract a Locality from a Nominatim `address` object.
 * Returns null when there is no usable locality/state.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pickLocality(addr: any): Locality | null {
  if (!addr || typeof addr !== "object") return null;
  const city: string =
    addr.city ?? addr.town ?? addr.municipality ?? addr.village ?? "";
  const county: string = addr.county ?? "";
  const stateName: string = addr.state ?? "";
  const iso: string = addr["ISO3166-2-lvl4"] ?? "";
  const stateAbbr = iso.replace(/^[A-Z]+-/, ""); // "US-IL" → "IL"
  const postcode: string = addr.postcode ?? "";

  // Need a state and at least one locality token to be useful.
  if (!stateName && !stateAbbr) return null;
  if (!city && !county) return null;

  return { city, county, stateName, stateAbbr, postcode };
}

function key(lat: number, lng: number) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`; // ~110m buckets
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reverse-geocode lat/lng to a Locality via Nominatim.
 *
 * Hardened for use inside chain providers:
 *  - Results are cached (30 min, ~110m buckets) to minimize Nominatim load,
 *    which is the main cause of rate-limit failures.
 *  - A single retry after a short delay handles a 429/403 throttle.
 *  - NEVER throws: returns null on any failure so callers degrade to an empty
 *    result ("no locations") instead of surfacing a 500 error.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<Locality | null> {
  const k = key(lat, lng);
  const hit = cache.get(k);
  if (hit) return hit;

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(6_000),
        cache: "no-store",
      });
      if (res.status === 429 || res.status === 403) {
        // Throttled — wait past Nominatim's 1 req/sec window and retry once.
        if (attempt === 0) {
          await sleep(1_100);
          continue;
        }
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json();
      const loc = pickLocality(data?.address);
      if (loc) cache.set(k, loc);
      return loc;
    } catch {
      // Timeout or network error — one retry, then give up gracefully.
      if (attempt === 0) {
        await sleep(300);
        continue;
      }
      return null;
    }
  }
  return null;
}
