import type { Store, PriceResult } from "./types";

const FALLBACK = 5.49;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.locations ?? [];
  return raw
    .map((s) => {
      const lat = s?.latitude;
      const lng = s?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      const address = [s.address1, s.city, s.state, s.zip].filter(Boolean).join(", ");
      return {
        id: String(s.id),
        name: s.locationName ?? `Whataburger #${s.id}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  const price = json?.recipe?.recipeBasicInfo?.price;
  if (typeof price === "number" && price > 0) {
    return { price, isLive: true };
  }
  return { price: FALLBACK, isLive: false };
}
