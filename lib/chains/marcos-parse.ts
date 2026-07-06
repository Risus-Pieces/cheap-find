import type { Store, PriceResult } from "./types";
import { haversineDistance } from "../haversine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawStore = Record<string, any>;

/**
 * Extract the raw `locations` array from Marco's ordering homepage HTML.
 * The array is embedded in an inline script as:
 *   let aOLO = { ..., locations: [ {...}, ... ], ... }
 *
 * Strategy: find `locations:` then bracket-balance from the `[` to its matching `]`.
 * This is robust to nested arrays/objects inside each store record (e.g. HRs, ZIPs).
 */
export function parseStoreList(html: string): RawStore[] {
  const marker = html.indexOf("locations:");
  if (marker === -1) return [];

  const arrStart = html.indexOf("[", marker);
  if (arrStart === -1) return [];

  let depth = 0;
  let arrEnd = -1;
  for (let i = arrStart; i < html.length; i++) {
    const ch = html[i];
    if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0) {
        arrEnd = i + 1;
        break;
      }
    }
  }
  if (arrEnd === -1) return [];

  try {
    return JSON.parse(html.slice(arrStart, arrEnd)) as RawStore[];
  } catch {
    return [];
  }
}

/**
 * Map raw store records to Store[], compute distance from (lat,lng),
 * sort ascending by distance, and return the nearest `limit` stores.
 */
export function nearestStores(
  raw: RawStore[],
  lat: number,
  lng: number,
  limit = 20,
): Store[] {
  return raw
    .filter(
      (s) =>
        typeof s.SKEY === "string" &&
        s.SKEY.length > 0 &&
        typeof s.LAT === "number" &&
        typeof s.LON === "number",
    )
    .map((s) => {
      const address = [s.ADD1, s.CITY, s.STA, s.ZIP]
        .filter(Boolean)
        .join(", ");
      const dist = haversineDistance(lat, lng, s.LAT as number, s.LON as number);
      return {
        store: {
          id: s.SKEY as string,
          name: (s.NAM as string) ?? "Marco's Pizza",
          address,
          lat: s.LAT as number,
          lng: s.LON as number,
        } as Store,
        dist,
      };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map((x) => x.store);
}

/**
 * Extract the Medium Pepperoni Magnifico price from a store's menu JSON.
 * Looks for item IID===12, price entry SZID===2 (Medium), field PRC.
 */
const FALLBACK = 12.99;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itms: any[] = json?.ITMS ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = itms.find((i: any) => i?.IID === 12);
  if (!item) return { price: FALLBACK, isLive: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prcs: any[] = item?.PRCS ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const med = prcs.find((p: any) => p?.SZID === 2 && typeof p?.PRC === "number" && p.PRC > 0);
  if (!med) return { price: FALLBACK, isLive: false };

  return { price: med.PRC as number, isLive: true };
}
