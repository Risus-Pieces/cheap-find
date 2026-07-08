import type { Store, PriceResult } from "./types";

const BENCHMARK_VARIANT = "12SCREEN";
const FALLBACK = 13.99;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json?.Stores ?? [];
  return raw
    .map((s) => {
      const lat = parseFloat(s?.StoreCoordinates?.StoreLatitude);
      const lng = parseFloat(s?.StoreCoordinates?.StoreLongitude);
      if (isNaN(lat) || isNaN(lng)) return null;
      const id = String(s.StoreID);
      // Collapse newlines (with optional surrounding whitespace) to ", "
      const address = (s.AddressDescription ?? "")
        .replace(/\s*\n\s*/g, ", ")
        .trim();
      return {
        id,
        name: `Domino's #${id}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  const raw = json?.Variants?.[BENCHMARK_VARIANT]?.Price;
  const price = Number(raw);
  if (price > 0) {
    return { price, isLive: true };
  }
  return { price: FALLBACK, isLive: false };
}
