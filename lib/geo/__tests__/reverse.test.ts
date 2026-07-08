import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pickLocality, reverseGeocode, _clearReverseCache } from "../reverse";

describe("pickLocality", () => {
  it("extracts city, county, state name/abbr, postcode from a Nominatim address", () => {
    const loc = pickLocality({
      city: "Chicago",
      county: "Cook County",
      state: "Illinois",
      "ISO3166-2-lvl4": "US-IL",
      postcode: "60601",
    });
    expect(loc).toEqual({
      city: "Chicago",
      county: "Cook County",
      stateName: "Illinois",
      stateAbbr: "IL",
      postcode: "60601",
    });
  });

  it("falls back through town/municipality/village for the locality", () => {
    expect(pickLocality({ town: "Berwyn", state: "Illinois" })?.city).toBe("Berwyn");
    expect(pickLocality({ municipality: "Cicero", state: "Illinois" })?.city).toBe("Cicero");
    expect(pickLocality({ village: "Oak Park", state: "Illinois" })?.city).toBe("Oak Park");
  });

  it("returns null when there is no usable locality or state", () => {
    expect(pickLocality({})).toBeNull();
    expect(pickLocality({ country: "United States" })).toBeNull();
  });
});

describe("reverseGeocode", () => {
  beforeEach(() => _clearReverseCache());
  afterEach(() => vi.restoreAllMocks());

  const okResponse = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as Response;

  it("returns the parsed locality on success", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse({ address: { city: "Dallas", state: "Texas", "ISO3166-2-lvl4": "US-TX" } }));
    const loc = await reverseGeocode(32.7767, -96.797);
    expect(loc?.city).toBe("Dallas");
    expect(loc?.stateAbbr).toBe("TX");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches results so repeated nearby lookups do not re-hit the network", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse({ address: { city: "Dallas", state: "Texas" } }));
    await reverseGeocode(32.7767, -96.797);
    await reverseGeocode(32.7767, -96.797); // identical coords
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once after a rate-limit (429) then succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
      .mockResolvedValueOnce(okResponse({ address: { city: "Houston", state: "Texas" } }));
    const loc = await reverseGeocode(29.76, -95.37);
    expect(loc?.city).toBe("Houston");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null (never throws) when the request keeps failing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 429 } as Response);
    await expect(reverseGeocode(0, 0)).resolves.toBeNull();
  });

  it("returns null (never throws) when fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await expect(reverseGeocode(10, 10)).resolves.toBeNull();
  });
});
