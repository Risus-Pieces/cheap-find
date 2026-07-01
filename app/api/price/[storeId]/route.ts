import { NextResponse } from "next/server";
import type { Protein } from "@/lib/proteins";

const BASE = "https://services.chipotle.com";
const KEY = "b4d9f36380184a3788857063bce25d6a";
const HEADERS = {
  "Ocp-Apim-Subscription-Key": KEY,
  Origin: "https://chipotle.com",
  Referer: "https://chipotle.com/order",
};

export interface PriceData {
  price: number;
  deliveryPrice: number;
  isLive: boolean;
}

const CACHE_TTL = 5 * 60 * 1_000;
const cache = new Map<string, { data: PriceData; ts: number }>();

function matchesProtein(itemName: string, itemType: string, protein: Protein): boolean {
  const n = itemName.toLowerCase();
  const t = itemType.toLowerCase();
  const isBowl = n.includes("bowl") || t.includes("bowl");
  if (protein === "veggie") {
    return (n.includes("veggie") || n.includes("vegetarian")) && isBowl;
  }
  return n.includes(protein) && isBowl;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId: rawId } = await params;
  const storeId = parseInt(rawId, 10);
  const { searchParams } = new URL(request.url);
  const protein = (searchParams.get("protein") ?? "chicken") as Protein;

  if (isNaN(storeId)) {
    return NextResponse.json({ error: "Invalid store ID" }, { status: 400 });
  }

  const cacheKey = `${storeId}-${protein}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({ ...hit.data, fromCache: true });
  }

  try {
    const res = await fetch(
      `${BASE}/menuinnovation/v1/restaurants/${storeId}/onlinemenu?channelId=web&includeUnavailableItems=false`,
      { headers: HEADERS, signal: AbortSignal.timeout(10_000), cache: "no-store" }
    );

    if (!res.ok) {
      return NextResponse.json({ price: 0, deliveryPrice: 0, isLive: false });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const menu: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entrees: any[] = menu?.entrees ?? [];

    for (const e of entrees) {
      const name: string = e?.itemName ?? "";
      const type: string = e?.itemType ?? "";

      if (matchesProtein(name, type, protein)) {
        const price = Number(e?.unitPrice ?? 0);
        const deliveryPrice = Number(e?.unitDeliveryPrice ?? price);

        if (price > 0) {
          const data: PriceData = { price, deliveryPrice, isLive: true };
          cache.set(cacheKey, { data, ts: Date.now() });
          return NextResponse.json(data);
        }
        break;
      }
    }

    return NextResponse.json({ price: 0, deliveryPrice: 0, isLive: false });
  } catch {
    return NextResponse.json({ price: 0, deliveryPrice: 0, isLive: false });
  }
}
