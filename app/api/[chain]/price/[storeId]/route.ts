import { NextResponse } from "next/server";
import { getChain } from "@/lib/chains/registry";
import { TTLCache } from "@/lib/cache";
import type { PriceResult } from "@/lib/chains/types";

const cache = new TTLCache<PriceResult>(5 * 60 * 1000);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chain: string; storeId: string }> }
) {
  const { chain: chainId, storeId } = await params;
  const provider = getChain(chainId);
  if (!provider) return NextResponse.json({ error: "Unknown chain" }, { status: 404 });

  const key = `${chainId}:${storeId}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ ...hit, fromCache: true });

  try {
    const result = await provider.getPrice(storeId);
    cache.set(key, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[/api/${chainId}/price/${storeId}]`, err);
    return NextResponse.json({ price: provider.fallbackPrice, isLive: false });
  }
}
