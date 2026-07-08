import type { Store, PriceResult } from "./types";

const FALLBACK = 8.19;
const BENCHMARK = "Broccoli Cheddar Soup";
// Multiple placard entries share the exact same display name for different
// sizes (cup / bowl / bread bowl / group). imgKey disambiguates the size —
// we want the "bowl" size specifically.
const BOWL_IMG_KEY = "broccoli-cheddar-soup-bowl";

/**
 * cafe/search (POST {latitude,longitude}) → { deliveryUnavailable, cafeList: Cafe[] }.
 * Each cafe: { cafeId, cafeName, cafeLocation:{addressLine1,city,countryDivision,postalCode,latitude,longitude} }.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.cafeList ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((cf: any) => {
      const loc = cf?.cafeLocation ?? {};
      const lat = loc.latitude;
      const lng = loc.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      const address = [loc.addressLine1, loc.city, loc.countryDivision, loc.postalCode]
        .filter(Boolean)
        .join(", ");
      const label = cf?.cafeName || loc.city;
      return {
        id: String(cf.cafeId),
        name: `Panera – ${label}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

/**
 * menu/placards/{cafeId}/version/{placardVersionId}/{placardScheduleVersionId}/{languageCode}
 * → { placards: { [plcId: string]: Item } } — an OBJECT keyed by plcId, not an array.
 * Find the "Broccoli Cheddar Soup" bowl (imgKey disambiguates from the cup/bread-bowl/group
 * sizes that share the identical name) and read its flat `price` field.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  const placards = json?.placards;
  if (placards && typeof placards === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Object.values(placards);
    const item = items.find((it) => it?.name === BENCHMARK && it?.imgKey === BOWL_IMG_KEY);
    const price = typeof item?.price === "number" ? item.price : 0;
    if (price > 0) return { price, isLive: false, cachedAt: Date.now() };
  }
  return { price: FALLBACK, isLive: false };
}
