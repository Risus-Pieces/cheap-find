import type { Store, PriceResult } from "./types";

const BENCHMARK_NAME = "5 classic wings";
const FALLBACK = 6.99;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.data?.locations ?? [];
  return raw
    .map((loc) => {
      const lat = loc?.latitude;
      const lng = loc?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      const address = [loc.streetAddress, loc.locality, loc.region].filter(Boolean).join(", ");
      return {
        id: String(loc.id),
        name: `Wingstop – ${loc.name ?? loc.locality}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories: any[] = json?.data?.categories ?? [];
  for (const category of categories) {
    const products = category?.products ?? [];
    for (const product of products) {
      const item = product?.item;
      const name = typeof item?.name === "string" ? item.name.toLowerCase().trim() : "";
      if (name === BENCHMARK_NAME && typeof item?.price === "number" && item.price > 0) {
        return { price: item.price, isLive: true };
      }
    }
  }
  return { price: FALLBACK, isLive: false };
}
