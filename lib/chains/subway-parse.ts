import type { Store, PriceResult } from "./types";

const FALLBACK = 9.49;
const BENCHMARK_MASTER_PRODUCT_ID = "12988"; // B.M.T.® — display name is identical across sizes
// Multiple product entries share the exact same name for different sizes
// (Footlong vs 6''). buildName disambiguates the size — we want the Footlong.
const FOOTLONG_BUILD_NAME = "Footlong";

/**
 * location-search (POST {searchOptions:{searchType:"BY_GEO",latitude,longitude}}) →
 * { nearbyResults: [{ resources, data }] }. Each result's `data`: { locationId,
 * address:{address1,city,stateProvince,postalCode}, geo:{latitude,longitude} }.
 * Subway locations have no marketing name (unlike Panera cafes), so the store
 * name is built from the street address + city.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.nearbyResults ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((entry: any) => {
      const d = entry?.data ?? {};
      const lat = d?.geo?.latitude;
      const lng = d?.geo?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      const addr = d?.address ?? {};
      const address = [addr.address1, addr.city, addr.stateProvince, addr.postalCode]
        .filter(Boolean)
        .join(", ");
      const label = [addr.address1, addr.city].filter(Boolean).join(", ");
      return {
        id: String(d.locationId),
        name: `Subway – ${label}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

/**
 * store-menu/{locationId} → { categories: [{ masterProducts: [{ id, displayName,
 * products: [{ id, name, price, buildName }] }] }] }. Find the B.M.T. masterProduct
 * (id 12988 — displayName alone isn't unique enough to trust across categories) and
 * read the Footlong-size product's flat `price` field.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories: any[] = json?.categories ?? [];
  if (Array.isArray(categories)) {
    for (const cat of categories) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterProducts: any[] = cat?.masterProducts ?? [];
      for (const mp of masterProducts) {
        if (mp?.id !== BENCHMARK_MASTER_PRODUCT_ID) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const products: any[] = mp?.products ?? [];
        const footlong = products.find((p) => p?.buildName === FOOTLONG_BUILD_NAME);
        const price = typeof footlong?.price === "number" ? footlong.price : 0;
        if (price > 0) return { price, isLive: false, cachedAt: Date.now() };
      }
    }
  }
  return { price: FALLBACK, isLive: false };
}
