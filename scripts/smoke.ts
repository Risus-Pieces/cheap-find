import { listChains } from "../lib/chains/registry";

// Downtown Chicago
const LAT = 41.8781;
const LNG = -87.6298;

async function main() {
  for (const chain of listChains()) {
    try {
      const stores = await chain.findStores(LAT, LNG);
      const first = stores[0];
      const price = first ? await chain.getPrice(first.id) : null;
      const tag = price
        ? price.isLive
          ? "live"
          : price.cachedAt
            ? "cached"
            : "estimated"
        : "no price";
      console.log(
        `${chain.name}: ${stores.length} stores; ${first?.name ?? "-"} → ` +
          (price ? `$${price.price} (${tag})` : "no price")
      );
    } catch (err) {
      console.log(`${chain.name}: ERROR ${(err as Error).message}`);
    }
  }
}

main();
