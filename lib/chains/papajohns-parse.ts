import type { Store, PriceResult } from "./types";

const FALLBACK = 14.99;
// Papa John's "Large" pizza is the 14 inch.
const BENCHMARK = "14 Inch Original Pepperoni Pizza";

/**
 * stores.getCarryoutStores (POST) → { result: { data: { json: { stores: Store[] } } } }.
 * Each store: { id, location:{street,latitude,longitude,city,state,postalCode}, distance }.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.result?.data?.json?.stores ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => {
      const loc = s?.location ?? {};
      const lat = loc.latitude;
      const lng = loc.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      const address = [loc.street, loc.city, loc.state, loc.postalCode]
        .filter(Boolean)
        .join(", ");
      return {
        id: String(s.id),
        name: `Papa John's #${s.id}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

/** Coerce a price from `regularMenuPrice` (number) or a `displayPrice` string ("$13.99"). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function priceOf(item: any): number {
  if (typeof item?.regularMenuPrice === "number" && item.regularMenuPrice > 0) {
    return item.regularMenuPrice;
  }
  const parsed = parseFloat(String(item?.displayPrice ?? "").replace(/[^0-9.]/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * product.getByStore (GET) → { result: { data: { json: { products: Product[] } } } }.
 * Find the Large (14 inch) Original Pepperoni and read its price.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products: any[] = json?.result?.data?.json?.products ?? [];
  if (Array.isArray(products)) {
    const item = products.find((p) => p?.name === BENCHMARK);
    const price = item ? priceOf(item) : 0;
    if (price > 0) return { price, isLive: false, cachedAt: Date.now() };
  }
  return { price: FALLBACK, isLive: false };
}
