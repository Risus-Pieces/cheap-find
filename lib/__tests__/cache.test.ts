import { describe, it, expect, vi } from "vitest";
import { TTLCache } from "../cache";

describe("TTLCache", () => {
  it("returns a stored value before it expires", () => {
    const c = new TTLCache<number>(1000);
    c.set("k", 42);
    expect(c.get("k")).toBe(42);
  });

  it("returns undefined after the TTL elapses", () => {
    vi.useFakeTimers();
    const c = new TTLCache<number>(1000);
    c.set("k", 42);
    vi.advanceTimersByTime(1001);
    expect(c.get("k")).toBeUndefined();
    vi.useRealTimers();
  });

  it("returns undefined for a missing key", () => {
    const c = new TTLCache<number>(1000);
    expect(c.get("nope")).toBeUndefined();
  });
});
