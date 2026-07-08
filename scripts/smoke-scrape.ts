/**
 * Live smoke test for the headless-scraped chains. NOT run in CI — it launches a
 * real browser and hits the chains' bot-walled sites. Run locally:
 *   npm run smoke:scrape
 *
 * Uses the local playwright backend (SCRAPE_BROWSER defaults to "local" in dev).
 */
import { getChain } from "../lib/chains/registry";

// Chains that are headless-scraped (cached prices, not live).
const SCRAPED = ["papajohns", "panera", "subway"];

// Downtown Chicago
const LAT = 41.8781;
const LNG = -87.6298;

async function main() {
  for (const id of SCRAPED) {
    const chain = getChain(id);
    if (!chain) {
      console.log(`${id}: (not registered — skipped)`);
      continue;
    }
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
