import type { ChainProvider } from "./types";
import { parseStores } from "./burgerking-parse";

const GATEWAY = "https://use1-prod-bk-gateway.rbictg.com/graphql";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const STORES_QUERY = `query GetRestaurants($input: RestaurantsInput) {
  restaurants(input: $input) {
    nodes { storeId name latitude longitude physicalAddress { address1 city stateProvince postalCode } }
  }
}`;

export const burgerking: ChainProvider = {
  id: "burgerking",
  name: "Burger King",
  benchmarkItem: "Whopper",
  accentColor: "#B8531B",
  fallbackPrice: 7.19,

  async findStores(lat, lng) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "x-ui-language": "en",
        "x-ui-region": "US",
        "x-ui-platform": "web",
      },
      body: JSON.stringify({
        operationName: "GetRestaurants",
        variables: { input: { filter: "NEARBY", coordinates: { userLat: lat, userLng: lng, searchRadius: 16000 }, first: 20, status: "OPEN" } },
        query: STORES_QUERY,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Burger King stores HTTP ${res.status}`);
    return parseStores(await res.json());
  },

  // Per-store Whopper pricing requires resolving RBI's Sanity CMS PLU join, which is
  // fragile and out of MVP scope. Every store shows the estimated national average.
  async getPrice() {
    return { price: this.fallbackPrice, isLive: false };
  },
};
