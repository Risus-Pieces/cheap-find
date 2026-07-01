import { NextResponse } from "next/server";
import { getStoreImage } from "@/lib/images";

const BASE = "https://services.chipotle.com";
const KEY = "b4d9f36380184a3788857063bce25d6a";
const HEADERS = {
  "Ocp-Apim-Subscription-Key": KEY,
  "Content-Type": "application/json",
  Origin: "https://chipotle.com",
  Referer: "https://chipotle.com/order",
};

export interface StoreLocation {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  image: string;
}

const CACHE_TTL = 5 * 60 * 1_000;
const cache = new Map<string, { stores: StoreLocation[]; ts: number }>();

function cacheKey(lat: number, lng: number) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStore(s: any, index: number): StoreLocation | null {
  // Skip closed or dead stores — only show ones that are actively OPEN
  if (s?.restaurantStatus !== "OPEN") return null;

  const addr = s?.addresses?.[0];
  if (!addr?.latitude || !addr?.longitude) return null;

  const addressStr = [
    addr.addressLine1,
    addr.locality,
    addr.administrativeArea,
    addr.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    id: s.restaurantNumber,
    name: `Chipotle – ${s.restaurantName}`,
    address: addressStr,
    lat: addr.latitude,
    lng: addr.longitude,
    image: getStoreImage(s.restaurantNumber),
  };
}

async function fetchPage(
  lat: number,
  lng: number,
  page: number
): Promise<{ stores: StoreLocation[]; totalPages: number }> {
  const res = await fetch(`${BASE}/restaurant/v3/restaurant`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      latitude: lat,
      longitude: lng,
      radius: 9999,
      pageSize: 20,
      pageIndex: page,
      embeds: { addressTypes: ["MAIN"] },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Chipotle search HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const totalPages: number = data?.pagingInfo?.totalPages ?? 1;

  const stores = (data?.data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any, i: number) => parseStore(s, page * 20 + i))
    .filter(Boolean) as StoreLocation[];

  return { stores, totalPages };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({ stores: hit.stores, fromCache: true });
  }

  try {
    // Fetch page 0 first to learn totalPages, then fetch remaining pages (up to 2 more)
    const page0 = await fetchPage(lat, lng, 0);
    const extraPages = Math.min(page0.totalPages - 1, 2); // fetch up to 2 more pages

    let allStores = [...page0.stores];

    if (extraPages > 0) {
      const extra = await Promise.allSettled(
        Array.from({ length: extraPages }, (_, i) => fetchPage(lat, lng, i + 1))
      );
      for (const r of extra) {
        if (r.status === "fulfilled") allStores.push(...r.value.stores);
      }
    }

    // Deduplicate by ID
    const seen = new Set<number>();
    allStores = allStores.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    if (allStores.length === 0) {
      return NextResponse.json({ error: "No locations found near you." }, { status: 404 });
    }

    cache.set(key, { stores: allStores, ts: Date.now() });
    return NextResponse.json({ stores: allStores, fromCache: false });
  } catch (err) {
    console.error("[/api/stores]", err);
    return NextResponse.json({ error: "Failed to fetch locations." }, { status: 500 });
  }
}
