import type { Store, PriceResult } from "./types";

const FALLBACK = 6.29;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.data ?? [];
  return raw
    .map((s) => {
      const lat = parseFloat(s?.lat);
      const lng = parseFloat(s?.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      // address2 is already "CITY, ST ZIP" in the real API — only fall back
      // to city when address2 is missing, to avoid duplicating the city.
      const address = [s.address1, s.address2 ?? s.city].filter(Boolean).join(", ");
      return {
        id: String(s.id),
        name: `Wendy's – ${s.name ?? s.address1}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  let found: number | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consider = (o: any) => {
    if (
      o &&
      typeof o === "object" &&
      "alaCarteMenuItemId" in o &&
      String(o.displayName ?? "").toLowerCase().startsWith("dave's single") &&
      typeof o.price === "number" &&
      o.price > 0
    ) {
      if (found == null || o.price < found) found = o.price;
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (o: any) => {
    if (o == null) return;
    consider(o);
    if (Array.isArray(o)) o.forEach(walk);
    else if (typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(json);
  return typeof found === "number"
    ? { price: found, isLive: true }
    : { price: FALLBACK, isLive: false };
}
