import type { Store, PriceResult } from "./types";

const FALLBACK = 9.65;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.data ?? [];
  return raw
    .map((s) => {
      if (s?.restaurantStatus !== "OPEN") return null;
      const addr = s?.addresses?.[0];
      if (!addr?.latitude || !addr?.longitude) return null;
      const address = [addr.addressLine1, addr.locality, addr.administrativeArea, addr.postalCode]
        .filter(Boolean)
        .join(", ");
      return {
        id: String(s.restaurantNumber),
        name: `Chipotle – ${s.restaurantName}`,
        address,
        lat: addr.latitude,
        lng: addr.longitude,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entrees: any[] = json?.entrees ?? [];
  for (const e of entrees) {
    const name = String(e?.itemName ?? "").toLowerCase();
    const type = String(e?.itemType ?? "").toLowerCase();
    const isChickenBowl = name.includes("chicken") && (name.includes("bowl") || type.includes("bowl"));
    if (isChickenBowl) {
      const price = Number(e?.unitPrice ?? 0);
      if (price > 0) {
        return { price, deliveryPrice: Number(e?.unitDeliveryPrice ?? price), isLive: true };
      }
    }
  }
  return { price: FALLBACK, isLive: false };
}
