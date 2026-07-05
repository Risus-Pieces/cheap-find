# fastfind

Pick a fast food chain, see every nearby location ranked cheapest to priciest for that chain's signature item — on an interactive map, with prices pulled live from each chain's own ordering API.

## How it works

1. Choose a chain from the chip picker (Chipotle, Taco Bell, Wendy's, Domino's, Marco's Pizza, Chili's, Whataburger, Popeyes).
2. Search an address or ZIP, or tap **Near me** to use GPS.
3. The app fetches nearby locations, then progressively loads prices for each store directly from the chain's public ordering backend.
4. Locations appear on a map and in a scrollable list, sorted by price (or distance — toggle in the sort bar). The cheapest store gets a badge. Tap any card or marker to zoom in.
5. Use **Search this area** after panning the map to reload for a new viewport.

Prices are cached in memory for 5 minutes server-side, so rapid re-searches don't hammer upstream APIs.

## Chains and pricing status

| Chain | Benchmark item | Pricing |
|---|---|---|
| Chipotle | Chicken Bowl | Live — per-store online ordering price |
| Taco Bell | Crunchwrap Supreme | Live — per-store online ordering price |
| Wendy's | Dave's Single | Live — per-store online ordering price |
| Domino's | Medium Hand Tossed Pizza | Live — per-store online ordering price |
| Marco's Pizza | Medium Pepperoni Magnifico | Live — per-store online ordering price |
| Chili's | Oldtimer with Cheese | Live — per-store online ordering price |
| Whataburger | Whataburger | Live — per-store online ordering price (regional; mostly TX/South) |
| Popeyes | Classic Chicken Sandwich | Live — per-store online ordering price |

**Live** means prices are fetched server-side from the chain's own public ordering API on demand.

**Estimated** means a hardcoded national average is displayed. The app degrades gracefully to estimated prices for any chain if its upstream API is unavailable.

Prices reflect online ordering / pickup prices, which may differ from in-store walk-in prices.

## Getting started

No API keys required.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm test` | Run the full Vitest suite (49 tests, no network) |
| `npm run smoke` | Hit each chain's live API and print one result per chain |

## Architecture

### Stack

- **Next.js 16** App Router, TypeScript 5, Tailwind 4
- **MapLibre GL JS** with OpenFreeMap vector tiles (no map API key)
- **Nominatim** for address geocoding (no API key)

### Provider pattern

Each chain is a self-contained module behind a shared `ChainProvider` interface:

```
lib/chains/
  types.ts                  ChainProvider interface + Store / PriceResult types
  meta.ts                   Display metadata (name, accent color, fallback price)
  registry.ts               Maps chain IDs to provider instances
  chipotle-parse.ts         Pure parsing functions (tested against fixtures)
  chipotle.ts               ChainProvider implementation
  tacobell-parse.ts / tacobell.ts
  wendys-parse.ts / wendys.ts
  dominos-parse.ts / dominos.ts
  marcos-parse.ts / marcos.ts
  chilis-parse.ts / chilis.ts
  whataburger-parse.ts / whataburger.ts
  popeyes-parse.ts / popeyes.ts
  __tests__/                Vitest unit tests (real API fixtures, no network)

test-fixtures/              Recorded API responses used by the unit tests

app/api/
  [chain]/stores/route.ts   GET /api/:chain/stores?lat=…&lng=…
  [chain]/price/[storeId]/route.ts  GET /api/:chain/price/:storeId
  geocode/route.ts          GET /api/geocode?q=…  (Nominatim proxy)
```

The API routes are chain-agnostic: they look up the provider from the registry and call `findStores` or `getPrice`. Adding a new chain does not require touching any route or UI code.

## Adding a new chain

1. Record a real API response to `test-fixtures/<chain>-stores.json` (and optionally a menu fixture).
2. Write `lib/chains/<chain>-parse.ts` with pure parsing functions; add Vitest tests in `lib/chains/__tests__/<chain>.test.ts` against the fixtures.
3. Implement `lib/chains/<chain>.ts` exporting a `ChainProvider` that calls the chain's API and delegates parsing to the parse module.
4. Register the provider in `lib/chains/registry.ts` and add display metadata to `lib/chains/meta.ts`.
5. Done. The `/api/[chain]/stores` and `/api/[chain]/price/[storeId]` routes and the chain picker UI pick it up automatically.

## Caveats

- **Unofficial integrations.** This app is not affiliated with, endorsed by, or sponsored by any of the featured chains or their parent companies. It uses publicly accessible ordering endpoints — these may change or begin blocking requests at any time, in which case the app falls back to estimated prices.
- **Online prices only.** Prices shown are online ordering / pickup prices. Walk-in menu prices may differ.
- **No guarantees.** Data is best-effort and may lag, be wrong, or be unavailable. Do not rely on it for anything consequential.

## Credit

Built on top of [cheapotle](https://github.com/akulanikhil/cheapotle) by Nikhil Akula (MIT), which originated the Chipotle price-comparison idea and the core map + location-card UI. This project extends that foundation with a multi-chain provider architecture, additional chains, and revised UI.

## License

MIT
