/**
 * Cache adapter for scraped data. Uses Vercel KV when configured
 * (KV_REST_API_URL present), otherwise falls back to an in-process TTL cache so
 * local dev and CI need no external service.
 *
 * Scraped prices are expensive to produce (a headless-browser page load), so we
 * cache aggressively: only the first inquiry for a given store/area pays the cost.
 */
import { TTLCache } from "../cache";

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// In-memory fallback. One cache per distinct TTL keeps expiry semantics simple.
const memCaches = new Map<number, TTLCache<unknown>>();
function memCache(ttlSeconds: number): TTLCache<unknown> {
  let c = memCaches.get(ttlSeconds);
  if (!c) {
    c = new TTLCache<unknown>(ttlSeconds * 1000);
    memCaches.set(ttlSeconds, c);
  }
  return c;
}
// Track which TTL bucket a key lives in so kvGet can find it without the TTL.
const memKeyTtl = new Map<string, number>();

export async function kvGet<T>(key: string): Promise<T | null> {
  if (kvConfigured()) {
    const { kv } = await import("@vercel/kv");
    const v = await kv.get<T>(key);
    return v ?? null;
  }
  const ttl = memKeyTtl.get(key);
  if (ttl === undefined) return null;
  const v = memCache(ttl).get(key);
  return v === undefined ? null : (v as T);
}

export async function kvSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (kvConfigured()) {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, value, { ex: ttlSeconds });
    return;
  }
  memKeyTtl.set(key, ttlSeconds);
  memCache(ttlSeconds).set(key, value);
}
