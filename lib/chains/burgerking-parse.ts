import type { Store } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.data?.restaurants?.nodes ?? [];
  return raw
    .map((s) => {
      if (typeof s?.latitude !== "number" || typeof s?.longitude !== "number") return null;
      const a = s?.physicalAddress ?? {};
      const address = [a.address1, a.city, a.stateProvince, a.postalCode].filter(Boolean).join(", ");
      return {
        id: String(s.storeId),
        name: `Burger King – ${a.city ?? s.storeId}`,
        address,
        lat: s.latitude,
        lng: s.longitude,
      } as Store;
    })
    .filter(Boolean) as Store[];
}
