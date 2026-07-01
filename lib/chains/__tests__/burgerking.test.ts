import { describe, it, expect } from "vitest";
import { parseStores } from "../burgerking-parse";

describe("burgerking parsers", () => {
  it("parses restaurants from the graphql response", () => {
    const json = {
      data: {
        restaurants: {
          nodes: [
            {
              storeId: "19162",
              name: "151 North Michigan Ave",
              latitude: 41.8848,
              longitude: -87.6241,
              physicalAddress: { address1: "151 North Michigan Ave", city: "CHICAGO", stateProvince: "Illinois", postalCode: "60601" },
            },
          ],
        },
      },
    };
    const stores = parseStores(json);
    expect(stores).toHaveLength(1);
    expect(stores[0].id).toBe("19162");
    expect(stores[0].lat).toBeCloseTo(41.8848, 3);
    expect(stores[0].address).toContain("CHICAGO");
  });

  it("returns empty array when no nodes", () => {
    expect(parseStores({ data: { restaurants: { nodes: [] } } })).toEqual([]);
  });
});
