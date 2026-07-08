import type { Store, PriceResult } from "./types";

const ITEM_ID = "item_101929";
const FALLBACK = 5.49;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.data?.restaurants?.nodes ?? [];
  return raw
    .map((node) => {
      const lat = node?.latitude;
      const lng = node?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      const a = node?.physicalAddress ?? {};
      const city = a.city ?? "";
      const address = [a.address1, city, a.stateProvince, a.postalCode]
        .filter(Boolean)
        .join(", ");
      return {
        id: String(node.number),
        name: `Popeyes – ${city || node.number}`,
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
  const items: any[] = json?.data?.storeMenu ?? [];
  const entry = items.find((i) => i?.id === ITEM_ID);
  const cents = entry?.price?.default;
  if (typeof cents === "number" && cents > 0) {
    return { price: cents / 100, isLive: true };
  }
  return { price: FALLBACK, isLive: false };
}
