import { NextResponse } from "next/server";
import { getChain } from "@/lib/chains/registry";
import { TTLCache } from "@/lib/cache";
import type { Store } from "@/lib/chains/types";

// Headless-scraped chains (Papa John's/Panera/Subway) launch chromium here, which
// needs the Node runtime and can take tens of seconds on a cold, uncached lookup.
export const runtime = "nodejs";
export const maxDuration = 60;

const cache = new TTLCache<Store[]>(5 * 60 * 1000);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chain: string }> }
) {
  const { chain: chainId } = await params;
  const provider = getChain(chainId);
  if (!provider) return NextResponse.json({ error: "Unknown chain" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const key = `${chainId}:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ stores: hit, fromCache: true });

  try {
    const stores = await provider.findStores(lat, lng);
    if (stores.length === 0) {
      return NextResponse.json({ error: "No locations found near you." }, { status: 404 });
    }
    cache.set(key, stores);
    return NextResponse.json({ stores, fromCache: false });
  } catch (err) {
    console.error(`[/api/${chainId}/stores]`, err);
    return NextResponse.json({ error: "Failed to fetch locations." }, { status: 500 });
  }
}
