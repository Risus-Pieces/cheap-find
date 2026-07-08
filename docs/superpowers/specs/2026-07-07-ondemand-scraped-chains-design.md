# On-Demand Headless-Scraped Chains — Design

**Date:** 2026-07-07
**Status:** Approved (user waived per-section approval; proceed to plan + implementation)
**Branch:** feature/chain-expansion

## Purpose

Add fast-food chains whose ordering sites are protected by Akamai bot-walls — where
plain server-side `fetch`/`curl` is silently dropped, but a **real headless browser
passes**. Deliver per-store benchmark prices for these chains through the existing
multi-chain price-map, marked as cached (not live).

## Spike evidence (2026-07-07, from a residential IP)

Playwright + stealth headless Chromium, one chain per protection type:

| Chain | Wall | Headless result |
|---|---|---|
| Panera | Akamai | ✅ real content; menu API `www-api.panerabread.com/www-api/public/menu/...` returns prices (`"price":6.29`, …) |
| Papa John's | Akamai | ✅ real content; in-session `/store/{id}/menu` + `/orderentry/menu?storeId={id}` return menu JSON with prices |
| Subway | Akamai | ✅ menu page 200 (per-store price + locator NOT yet verified) |
| Five Guys | Cloudflare | ❌ persistent "Just a moment…" challenge, even with stealth |
| Raising Cane's | Cloudflare | ❌ (same class as Five Guys) |
| Panda Express | DataDome | ❌ 403 block |

**Winning technique:** use the browser to obtain Akamai clearance on the chain's
origin, then run an in-page `fetch` against the chain's own JSON menu/locator API
(which already contains prices). Not HTML screen-scraping.

## Scope

**In:** Panera, Papa John's, Subway (Subway provisional — verify locator + per-store
price during build; drop if unusable, per the de-risk rule used throughout this project).

**Out (documented, not feasible from a server without paid residential proxies):**
Five Guys, Raising Cane's (Cloudflare), Panda Express (DataDome).

Benchmark items (confirm exact item ids/prices during build):
- Panera → Broccoli Cheddar Soup (bowl)
- Papa John's → Large Pepperoni Pizza
- Subway → Footlong Italian B.M.T.

## Architecture

### Browser session helper — `lib/scrape/browser.ts`

```ts
interface ScrapeResult<T> { data: T | null; ok: boolean; }
// Launches headless Chromium, navigates to `origin` to clear Akamai, then runs
// `inPage` (an in-browser fetch returning JSON) and returns its result. Never throws.
async function withBrowserSession<T>(
  origin: string,
  inPage: (fetchJson: (url: string, init?: RequestInit) => Promise<any>) => Promise<T>
): Promise<ScrapeResult<T>>;
```

- Backend selected by env `SCRAPE_BROWSER`:
  - `vercel` (default): `@sparticuz/chromium` + `playwright-core` — runs inside the
    Vercel Node function. Fluid Compute reuses the browser across concurrent requests.
  - `browserless`: connect to a hosted browser over CDP (`BROWSERLESS_WS` env) — the
    fallback if Akamai blocks Vercel's datacenter IP. Selecting it is config-only;
    no provider code changes.
  - `local` (dev/tests): plain `playwright` chromium.
- Isolated to the scraped-chain code paths so the heavy chromium dependency does not
  bloat other routes.

### Providers — same `ChainProvider` interface

Each scraped chain is a normal provider (`lib/chains/panera.ts`, `papajohns.ts`,
`subway.ts`) plus a pure parser module (`<chain>-parse.ts`) unit-tested against saved
JSON fixtures — identical pattern to the 9 existing chains.

- `findStores(lat, lng)`: resolve nearby stores. Papa John's has a reachable Yext
  locator; Panera/Subway locators run through the browser session if walled.
- `getPrice(storeId)`: in-session `fetch` of the chain's menu API → parse the
  benchmark item price.

### Caching — `lib/scrape/cache.ts` over Vercel KV

- Two logical caches: store-lists keyed by `${chain}:${lat.toFixed(2)},${lng.toFixed(2)}`
  (TTL ~1h) and per-store prices keyed by `${chain}:${storeId}` (TTL ~12–24h).
- On miss → run the browser scrape, store, return. On hit → instant.
- **KV adapter with fallback:** if `KV_REST_API_URL`/token env are absent (local, CI),
  transparently use the in-memory `TTLCache` from `lib/cache.ts`. Tests and local dev
  need no external service.

### Request flow

`/api/panera/stores?lat&lng` → cache or scrape locator. Then the UI progressively calls
`/api/panera/price/{id}` → cache or scrape menu. The existing chain-parameterized routes
and progressive price loading are reused unchanged.

## Price status / UX

- Extend `PriceResult` with optional `cachedAt?: number` (epoch ms).
- Three badge states in `LocationCard`: live (green), **cached · "2h ago" (amber)**,
  estimated fallback (gray). Scraped prices set `isLive:false` + `cachedAt`.
- `CHAIN_META` gets a per-chain accent color for the three new chains.

## Error handling

- `withBrowserSession` never throws → `{ok:false, data:null}`; providers degrade to the
  chain's estimated national fallback (`isLive:false`, no `cachedAt`) and still return
  stores. No 500s (same graceful contract as the Chili's fix).
- If Akamai blocks Vercel's IP in production, every scrape returns fallback estimates —
  visibly degraded but not broken — signalling it's time to flip `SCRAPE_BROWSER=browserless`.

## Testing

- **Unit (CI, no network):** pure `<chain>-parse.ts` parsers against saved fixtures
  (captured during build via the local browser), plus the KV-adapter fallback logic.
- **Manual smoke (gated, not CI):** extend `npm run smoke` (or a `smoke:scrape` script)
  to run one real local headless scrape per scraped chain and print the price.

## Build sequencing (de-risk)

1. Browser helper + KV adapter (with in-memory fallback) + tests.
2. **One vertical slice — Papa John's** (cleanest API) end-to-end, verified locally.
3. Replicate to Panera, then Subway (drop Subway if locator/price can't be verified).
4. UX badge + registry/meta wiring + README + gated smoke.
5. Deploy; confirm whether Vercel's IP passes Akamai; flip to Browserless if not.

## Dependencies added

`playwright-core`, `@sparticuz/chromium` (prod); `playwright` + `playwright-extra` +
`puppeteer-extra-plugin-stealth` (dev/local scrape); `@vercel/kv` (prod, optional at runtime).

## Caveats

- Prices are cached snapshots (badged), not live.
- Unofficial integration; bot-wall behavior and menu-API shapes may change. Graceful
  degradation to estimates is a core requirement.
- On-demand + long cache keeps request volume low (only real inquiries trigger a scrape).
