import { describe, it, expect, vi, afterEach } from "vitest";
import { kvGet, kvSet } from "../cache";

describe("scrape KV cache adapter (in-memory fallback)", () => {
  // No KV_REST_API_URL in the test env → falls back to in-memory TTLCache.
  afterEach(() => vi.useRealTimers());

  it("round-trips a stored value", async () => {
    await kvSet("k1", { price: 9.99 }, 60);
    expect(await kvGet<{ price: number }>("k1")).toEqual({ price: 9.99 });
  });

  it("returns null for a missing key", async () => {
    expect(await kvGet("nope-never-set")).toBeNull();
  });

  it("expires values after the TTL", async () => {
    vi.useFakeTimers();
    await kvSet("k2", 42, 1); // 1 second TTL
    expect(await kvGet<number>("k2")).toBe(42);
    vi.advanceTimersByTime(1001);
    expect(await kvGet<number>("k2")).toBeNull();
  });
});
