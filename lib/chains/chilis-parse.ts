import type { Store, PriceResult } from "./types";

const FALLBACK = 12.49;

/**
 * Extract stores from Chili's Next.js SSR city page.
 *
 * The page embeds store data in React Server Components flight payloads:
 *   self.__next_f.push([1, "<RSC JSON string with currentCityMergedData:[...]>"])
 *
 * We locate the `currentCityMergedData` key inside the RSC string and
 * bracket-count our way to the end of the array.
 */
export function parseStoresHtml(html: string): Store[] {
  try {
    const PUSH_RE = /self\.__next_f\.push\((\[[\s\S]*?\])\)/g;
    let m: RegExpExecArray | null;
    while ((m = PUSH_RE.exec(html)) !== null) {
      const raw = m[1];
      if (!raw.includes("currentCityMergedData")) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let outer: any;
      try {
        outer = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!Array.isArray(outer) || typeof outer[1] !== "string") continue;
      const s: string = outer[1];
      const marker = '"currentCityMergedData":';
      const markerIdx = s.indexOf(marker);
      if (markerIdx < 0) continue;
      const arrStart = s.indexOf("[", markerIdx + marker.length);
      if (arrStart < 0) continue;
      let depth = 0;
      let arrEnd = arrStart;
      for (let i = arrStart; i < s.length; i++) {
        if (s[i] === "[") depth++;
        else if (s[i] === "]") {
          depth--;
          if (depth === 0) {
            arrEnd = i;
            break;
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let stores: any[];
      try {
        stores = JSON.parse(s.slice(arrStart, arrEnd + 1));
      } catch {
        continue;
      }
      return stores
        .map((store) => {
          const lat = store?.latitude;
          const lng = store?.longitude;
          const slug = store?.slug;
          if (
            typeof lat !== "number" ||
            typeof lng !== "number" ||
            typeof slug !== "string"
          )
            return null;
          const parts = [
            store.streetaddress,
            store.city,
            store.state,
            store.zip,
          ].filter(Boolean);
          return {
            id: slug,
            name: `Chili's – ${store.name ?? slug}`,
            address: parts.join(", "),
            lat,
            lng,
          } as Store;
        })
        .filter(Boolean) as Store[];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Find the Oldtimer® Burger W/ Cheese price from a Chili's menu JSON.
 *
 * Priority: à-la-carte entry (any category whose name does NOT contain "3 For Me")
 * with the highest standalone cost — typically in "Big Mouth Burgers®".
 * Skips items with null or zero cost.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories: any[] = json?.categories ?? [];

  const OLDTIMER_RE = /old\s*timer.*cheese/i;
  const COMBO_RE = /3\s*for\s*me/i;

  let bestPrice: number | null = null;

  for (const cat of categories) {
    const isCombo = COMBO_RE.test(cat?.name ?? "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products: any[] = cat?.products ?? [];
    for (const p of products) {
      if (!OLDTIMER_RE.test(p?.name ?? "")) continue;
      const cost = p?.cost;
      if (typeof cost !== "number" || cost <= 0) continue;
      // Prefer non-combo; only fall back to combo if nothing else found
      if (!isCombo) {
        // Take first à-la-carte match (categories are ordered so Big Mouth Burgers comes first)
        return { price: cost, isLive: true };
      } else if (bestPrice === null) {
        bestPrice = cost;
      }
    }
  }

  if (bestPrice !== null) return { price: bestPrice, isLive: true };
  return { price: FALLBACK, isLive: false };
}
