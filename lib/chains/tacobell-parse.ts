import type { Store, PriceResult } from "./types";

const CRUNCHWRAP_CODE = "22362";
const FALLBACK = 6.49;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.nearByStores ?? [];
  return raw
    .map((s) => {
      const lat = s?.geoPoint?.latitude;
      const lng = s?.geoPoint?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      const a = s?.address ?? {};
      const address = [a.line1, a.town, a.region?.isocode?.replace("US-", ""), a.postalCode]
        .filter(Boolean)
        .join(", ");
      return {
        id: String(s.storeNumber),
        name: `Taco Bell #${s.storeNumber}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  // Fast path for trimmed fixture
  const fast = json?.crunchwrapSupreme?.price?.value;
  if (typeof fast === "number" && fast > 0) {
    return { price: fast, isLive: true };
  }
  // Real API: walk tree for product code 22362 with a positive price
  let found: number | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (o: any) => {
    if (found !== null || o == null) return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    if (typeof o === "object") {
      if (o.code === CRUNCHWRAP_CODE && typeof o.price?.value === "number" && o.price.value > 0) {
        found = o.price.value;
        return;
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(json);
  return typeof found === "number" ? { price: found, isLive: true } : { price: FALLBACK, isLive: false };
}
