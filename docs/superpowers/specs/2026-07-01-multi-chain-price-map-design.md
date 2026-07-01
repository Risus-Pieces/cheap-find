# Multi-Chain Fast Food Price Map — Design

**Date:** 2026-07-01
**Status:** Approved by user

## Purpose

A web app that shows the cheapest nearby location of a fast food chain, since chains price the same item differently per store (sometimes by $1.50+). Users pick a chain, see nearby locations ranked cheapest-to-most-expensive for that chain's benchmark item on an interactive map.

Generalizes the open-source [cheapotle](https://github.com/akulanikhil/cheapotle) (MIT) from Chipotle-only to multi-chain.

## Scope (MVP)

- **Chains:** Chipotle, Wendy's, Taco Bell, Burger King. (McDonald's deferred — harder auth.)
- **Comparison model:** per-chain price map, one chain at a time. No cross-chain item comparison.
- **One fixed benchmark item per chain** (no item picker in MVP).
- US-focused (matching the chains' US ordering APIs and Nominatim US/CA geocoding).

## Architecture

Fork/vendor cheapotle as the base: Next.js 16 (App Router), Tailwind CSS 4, MapLibre GL JS + OpenFreeMap tiles, TypeScript 5, Nominatim geocoding. No database; no API keys required.

### ChainProvider interface

Each chain is one module implementing:

```ts
interface ChainProvider {
  id: string;                // "chipotle" | "wendys" | "tacobell" | "burgerking"
  name: string;
  benchmarkItem: string;     // e.g. "Chicken Bowl"
  accentColor: string;
  fallbackPrice: number;     // national average, used when API fails
  findStores(lat: number, lng: number): Promise<Store[]>;
  getPrice(storeId: string): Promise<PriceResult>;
}

interface PriceResult {
  price: number;
  deliveryPrice?: number;
  isLive: boolean;           // false = estimated fallback
}
```

### API routes

- `GET /api/[chain]/stores?lat=&lng=` — nearby locations (5-min in-memory cache)
- `GET /api/[chain]/price/[storeId]` — benchmark item price (5-min cache)
- `GET /api/geocode?q=` — shared Nominatim wrapper

Shared infrastructure (geocoding, Haversine distance, map, search UI, sort, "search this area", progressive loading) stays chain-agnostic, reused from cheapotle.

## Chain integrations

| Chain | Benchmark item | API | Confidence |
|---|---|---|---|
| Chipotle | Chicken Bowl | `services.chipotle.com` menu API (from cheapotle, keep as-is) | High — proven |
| Taco Bell | Crunchwrap Supreme | Taco Bell web ordering API (store locator + per-store menu) | High — prior art (ben9583 price comparer) |
| Wendy's | Dave's Single | `api.app.wendys.com` web ordering API | Medium — per-store pricing needs verification |
| Burger King | Whopper | BK web ordering GraphQL API | Medium — pricing shape needs verification |

**De-risking rule:** Wendy's/BK per-store pricing gets verified during implementation. If an API is blocked or lacks per-store prices, that chain ships as `estimated`-only or is dropped from the MVP — it must not stall the other chains.

Each chain has a runtime status per store: `live` / `estimated` / `unavailable`.

## Data freshness

Prices fetched server-side on demand, 5-minute in-memory cache, no persistence. Progressive loading: ~10 closest stores priced immediately, remainder in background.

## UI / UX

Single-page, mobile-first, following cheapotle's layout:

- **Landing:** chain picker as logo chips (Chipotle default) + search bar ("Use My Location" or address/ZIP).
- **Results:** full-height map with price-labeled markers; cheapest location gets a distinct green marker + "CHEAPEST" badge; scrollable card list (price, distance, address, live/estimated badge); sort toggle (price ↔ distance); "Search this area" on map pan.
- **Chain switching** preserves the current location/search and refetches for the new chain.
- Per-chain accent colors: Chipotle maroon, Wendy's red, Taco Bell purple, BK orange-brown.

## Error handling

- Chain pricing API unreachable/shape changed → hardcoded national-average fallback price, marked "estimated".
- Geolocation denied → address/ZIP search; Nominatim failure → inline search-bar error.
- A chain's store-search endpoint fails entirely → error banner for that chain only; other chains unaffected.

## Testing

- Unit tests per chain provider parsing saved real-API fixture JSON (no live API calls in CI).
- Unit tests for shared logic (Haversine, cache, sort).
- Manual pre-deploy smoke script: hits each provider live for one known location, prints prices.

## Caveats

- Prices reflect online-ordering/pickup pricing, which may differ from walk-in menu prices.
- Unofficial integrations — not affiliated with or endorsed by any chain. APIs may change or block requests at any time; graceful degradation is a core requirement, not an edge case.

## Deferred (post-MVP)

- McDonald's and additional chains.
- Multiple items per chain / item picker.
- Cross-chain or category-based comparison.
