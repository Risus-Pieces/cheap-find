# On-Demand Headless-Scraped Chains — Implementation Plan

> **For agentic workers:** implement task-by-task with TDD and frequent commits. Steps use `- [ ]`.

**Goal:** Add Panera, Papa John's, and Subway (provisional) to the price map via an on-demand headless-browser scraper that clears Akamai and calls each chain's own JSON menu API, cached in Vercel KV, with prices badged "cached".

**Architecture:** A `withBrowserSession` helper (swappable backend: vercel `@sparticuz/chromium` / hosted browserless / local playwright) obtains Akamai clearance then runs in-page `fetch`. Each chain is a normal `ChainProvider` with pure fixture-tested parsers; store/price results cached via a KV adapter that falls back to in-memory `TTLCache` when KV env is absent.

**Tech Stack:** Next.js 16, TypeScript, Playwright (`playwright-core` + `@sparticuz/chromium` prod; `playwright` + stealth local), `@vercel/kv`, Vitest.

Reference: spec `docs/superpowers/specs/2026-07-07-ondemand-scraped-chains-design.md`. Follow the existing provider pattern (`lib/chains/tacobell*.ts`, tests, `test-fixtures/`).

---

## File structure

```
lib/scrape/
  browser.ts        withBrowserSession() + backend selection (vercel|browserless|local)
  cache.ts          kvGet/kvSet with in-memory TTLCache fallback
  __tests__/cache.test.ts
lib/chains/
  papajohns-parse.ts / papajohns.ts   (+ __tests__/papajohns.test.ts)
  panera-parse.ts    / panera.ts       (+ __tests__/panera.test.ts)
  subway-parse.ts    / subway.ts        (+ __tests__/subway.test.ts)  [provisional]
test-fixtures/        papajohns-*.json, panera-*.json, subway-*.json
scripts/smoke-scrape.ts   gated live headless smoke
```

Sequencing de-risks by proving the vertical slice (browser + Papa John's) before scaling.

---

## Task 1: Scrape dependencies + browser session helper

**Files:** Create `lib/scrape/browser.ts`; modify `package.json`.

- [ ] Install: `npm i playwright-core @sparticuz/chromium @vercel/kv` and `npm i -D playwright playwright-extra puppeteer-extra-plugin-stealth` and `npx playwright install chromium`.
- [ ] Implement `lib/scrape/browser.ts` exporting `withBrowserSession<T>(origin, inPage): Promise<{data:T|null, ok:boolean}>`:
  - Backend by `process.env.SCRAPE_BROWSER` (default `local` when `NODE_ENV!=="production"`, else `vercel`).
  - `local`: `import("playwright-extra")` chromium + stealth. `vercel`: `playwright-core` + `@sparticuz/chromium` executablePath. `browserless`: `chromium.connectOverCDP(process.env.BROWSERLESS_WS)`.
  - Launch, new context (desktop Chrome UA, 1280×900), `page.goto(origin, {waitUntil:"domcontentloaded"})`, `waitForTimeout(6000)` for challenge clearance, then run `inPage(fetchJson)` where `fetchJson(url,init)` does `page.evaluate` of an in-page `fetch(url,{...init, headers:{accept:"application/json"}}).then(r=>r.json())`. Wrap everything in try/catch → return `{data:null, ok:false}` on any error. Always close the browser in `finally`.
- [ ] Manual verify (not CI): a throwaway script that calls `withBrowserSession("https://www.papajohns.com/order/menu", ...)` and confirms it returns non-null for an in-page fetch of `/orderentry/menu?storeId=<real>`; expect ok:true. (Captured during Task 3.)
- [ ] Commit: `feat: headless browser session helper for bot-walled chains`.

## Task 2: KV cache adapter with in-memory fallback

**Files:** Create `lib/scrape/cache.ts`, `lib/scrape/__tests__/cache.test.ts`.

- [ ] TDD: `kvGet<T>(key)` / `kvSet<T>(key, value, ttlSeconds)`. When `process.env.KV_REST_API_URL` is unset, use a module-level `TTLCache` (from `lib/cache.ts`) keyed by ttl; when set, use `@vercel/kv` `get`/`set` with `{ex: ttlSeconds}`. Test the fallback path (no env) round-trips and expires; mock is unnecessary since fallback is in-memory.
- [ ] Commit: `feat: KV cache adapter with in-memory fallback`.

## Task 3: Papa John's parsers (fixtures via live browser)

**Files:** Create `lib/chains/papajohns-parse.ts`, `lib/chains/__tests__/papajohns.test.ts`, `test-fixtures/papajohns-stores.json`, `test-fixtures/papajohns-menu.json`.

- [ ] Capture fixtures with the local browser (spike recipe): store locator near Chicago (Yext `locations.papajohns.com` key `c6ca3cce7f13b34701a25cba845759be`, or the in-session locator) → 3 stores with id/lat/lng/address. Then in-session `GET /orderentry/menu?storeId={id}` → trim to the Large Pepperoni product with its price. Record exact field paths + benchmark price.
- [ ] TDD `parseStores(json)`→Store[] and `parsePrice(json)`→PriceResult (match Large Pepperoni; positive price → {price, isLive:false, cachedAt:Date.now()}; else fallback {price:14.99, isLive:false}). Fixtures drive assertions.
- [ ] Commit: `feat: Papa John's parsers`.

## Task 4: Papa John's provider (browser + cache)

**Files:** Create `lib/chains/papajohns.ts`.

- [ ] `findStores(lat,lng)`: `kvGet` store-list; on miss `withBrowserSession(origin, ...)` to fetch locator, `parseStores`, `kvSet` (ttl 3600). `getPrice(storeId)`: `kvGet` price; on miss scrape menu API, `parsePrice`, `kvSet` (ttl 43200). On `ok:false` return estimated fallback. Metadata: id "papajohns", name "Papa John's", benchmarkItem "Large Pepperoni Pizza", accentColor "#0A7E3D" (or brand), fallbackPrice 14.99.
- [ ] Commit: `feat: Papa John's provider (headless-scraped, cached)`.

## Task 5: cachedAt on PriceResult + LocationCard badge + Map/meta

**Files:** modify `lib/chains/types.ts`, `app/components/LocationCard.tsx`, `lib/chains/meta.ts`.

- [ ] Add `cachedAt?: number` to `PriceResult`. LocationCard: render three states — live (green), cached amber with relative time (`cachedAt`), estimated gray. Add Papa John's to `CHAIN_META`.
- [ ] Commit: `feat: cached-price badge + Papa John's metadata`.

## Task 6: Register Papa John's + verify vertical slice

**Files:** modify `lib/chains/types.ts` (ChainId), `lib/chains/registry.ts`, `lib/chains/__tests__/registry.test.ts`.

- [ ] Add "papajohns" to union + registry + sorted registry test. `npx vitest run`, `tsc`, `lint`, `build` all green. Run the gated local smoke (Task 9 script early) to confirm a real Papa John's price end-to-end.
- [ ] Commit: `feat: register Papa John's (headless-scraped chain)`.

## Task 7: Panera parser + provider

**Files:** Create `lib/chains/panera-parse.ts`, `panera.ts`, tests, fixtures; wire registry/meta.

- [ ] Capture via browser: cafe locator near Chicago + menu API `www-api.panerabread.com/www-api/public/menu/...` (has prices). Benchmark Broccoli Cheddar Soup (bowl). Parser + provider like Papa John's. Register. Fallback 8.19, accent brand green.
- [ ] Commit: `feat: Panera provider (headless-scraped, cached)`.

## Task 8: Subway parser + provider (provisional — drop if unverified)

**Files:** Create `lib/chains/subway-parse.ts`, `subway.ts`, tests, fixtures; wire.

- [ ] Attempt via browser: locator by lat/lng + per-store menu with Footlong Italian B.M.T. price. If a per-store price + geo-locator cannot be obtained in the timebox, STOP and leave Subway out (document in README excluded list). Otherwise implement like the others. Fallback 9.49.
- [ ] Commit: `feat: Subway provider (headless-scraped)` OR `docs: Subway not viable, excluded`.

## Task 9: Gated smoke + README + final verify

**Files:** Create `scripts/smoke-scrape.ts`; modify `README.md`, `package.json`.

- [ ] `smoke-scrape.ts` iterates the scraped chains, runs one real local scrape each, prints price. Script `"smoke:scrape": "tsx scripts/smoke-scrape.ts"`.
- [ ] README: add the new chains (badged cached), note the 3 Cloudflare/DataDome chains as excluded, document `SCRAPE_BROWSER`/`BROWSERLESS_WS`/KV envs.
- [ ] `npx vitest run` + `tsc` + `lint` + `build` green. Commit: `docs: document headless-scraped chains + envs`.

---

## Self-review notes
- Spec coverage: browser helper (T1), KV+fallback (T2), providers as ChainProvider (T3–4,7,8), cachedAt+badge (T5), registry wiring (T6+), gated smoke + README + excluded-chains doc (T9), Subway de-risk (T8). Covered.
- Vercel-IP-vs-Akamai risk: handled at deploy (flip SCRAPE_BROWSER=browserless); build/test use local backend + in-memory cache so CI needs no browser/KV.
- Type consistency: `PriceResult.cachedAt?`, `withBrowserSession` return `{data,ok}`, `kvGet/kvSet` names used consistently across tasks.
