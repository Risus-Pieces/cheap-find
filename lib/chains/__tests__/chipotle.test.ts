import { describe, it, expect } from "vitest";
import { parseStores, parsePrice } from "../chipotle-parse";

describe("chipotle parsers", () => {
  it("parses OPEN stores and skips others", () => {
    const json = {
      data: [
        {
          restaurantStatus: "OPEN",
          restaurantNumber: 499,
          restaurantName: "River North",
          addresses: [
            {
              latitude: 41.89,
              longitude: -87.63,
              addressLine1: "1 W Ohio",
              locality: "Chicago",
              administrativeArea: "IL",
              postalCode: "60654",
            },
          ],
        },
        { restaurantStatus: "CLOSED", restaurantNumber: 500, addresses: [] },
      ],
    };
    const stores = parseStores(json);
    expect(stores).toHaveLength(1);
    expect(stores[0].id).toBe("499");
    expect(stores[0].address).toContain("Chicago");
  });

  it("parses the chicken bowl price", () => {
    const json = { entrees: [{ itemName: "Chicken Bowl", itemType: "Bowl", unitPrice: 10.5, unitDeliveryPrice: 12.0 }] };
    const r = parsePrice(json);
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(10.5);
    expect(r.deliveryPrice).toBe(12.0);
  });

  it("returns estimated when no chicken bowl exists", () => {
    expect(parsePrice({ entrees: [] }).isLive).toBe(false);
  });
});
