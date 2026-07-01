# Multi-Chain Fast Food Price Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app where a user picks a fast food chain and sees nearby locations ranked cheapest-to-most-expensive for that chain's benchmark item on an interactive map, generalizing the open-source cheapotle app from Chipotle-only to multiple chains.

**Architecture:** Fork cheapotle (Next.js 16 App Router) as the base. Introduce a `ChainProvider` abstraction — one module per chain implementing `findStores` and `getPrice`. Chain-specific API routes live under `/api/[chain]/...`; shared infra (geocoding, map, distance, UI) stays chain-agnostic. No database; 5-minute in-memory cache per route.

**Tech Stack:** Next.js 16, TypeScript 5, Tailwind CSS 4, MapLibre GL JS + OpenFreeMap, Nominatim geocoding, Vitest for unit tests.

---

## Verified API Findings (real responses captured 2026-07-01)

These were confirmed live during planning. Fixtures saved in `test-fixtures/`.

**Chipotle** (from cheapotle, unchanged):
- Stores: `POST https://services.chipotle.com/restaurant/v3/restaurant` with `Ocp-Apim-Subscription-Key: b4d9f36380184a3788857063bce25d6a`.
- Price: `GET https://services.chipotle.com/menuinnovation/v1/restaurants/{id}/onlinemenu?channelId=web` → `entrees[]`, match Chicken Bowl → `unitPrice`.

**Taco Bell** (confirmed live, no key):
- Stores: `GET https://www.tacobell.com/tacobellwebservices/v4/tacobell/stores?latitude={lat}&longitude={lng}` → `nearByStores[]`. Each store: `storeNumber` (id, e.g. `"036215"`), `geoPoint.latitude`, `geoPoint.longitude`, `name`, `address.{line1,town,region.isocode,postalCode}`, `formattedDistance`.
- Price: `GET https://www.tacobell.com/tacobellwebservices/v2/tacobell/products/menu/{storeNumber}` → deep tree; find product with `code === "22362"` (Crunchwrap Supreme) and `price.value`. Confirmed $8.49 at store 036215.
- Requires `User-Agent` header (a browser UA string).

**Wendy's** (confirmed live, no key):
- Host is `digitalservices.prod.ext-aws.wendys.com` (NOT `api.app.wendys.com` — that no longer resolves).
- Stores: `GET /LocationServices/rest/nearbyLocations?lang=en&cntry=US&sourceCode=ORDER.WENDYS&version=20.0.0&lat={lat}&long={lng}&limit=25&filterSearch=false&radius=25` → `data[]`. Each store: `id` (e.g. `"1206"`), `lat`, `lng` (strings), `name` (street), `address1`, `address2`, `city`, `distance` (string, miles). NOTE the required param is `cntry` (misspelled), not `country`.
- Price: `GET /menu/getSiteMenu?lang=en&cntry=US&sourceCode=ORDER.WENDYS&version=20.0.0&siteNum={id}&menuChannel=WEB_GUEST` → `menuLists`. Walk to `salesItems[]`, find entry with `displayName` starting "Dave's Single" and a numeric `price`. Confirmed $5.79 at store 1206. `menuChannel` MUST be `WEB_GUEST` (`web` returns 400).

**Burger King** (store search live; PER-STORE PRICING DEFERRED):
- Stores: `POST https://use1-prod-bk-gateway.rbictg.com/graphql` (GraphQL `restaurants` query with `NEARBY` filter) works with no auth; returns `storeId`, `name`, `latitude`, `longitude`, `physicalAddress`.
- Pricing is NOT reliably reachable: the `plus(storeId)` query returns a 90k-entry PLU→price map (cents), but resolving the Whopper to its PLU requires joining RBI's Sanity CMS `vendorConfigs` per POS vendor, and the direct constantPlu (110/1010) does not appear in the price map. This is fragile and out of scope for MVP.
- **DECISION:** Per the spec's de-risking rule, Burger King ships in the MVP as **estimated-only**: store discovery is live, but every store shows a hardcoded national-average Whopper price flagged `estimated`. A follow-up task (post-MVP) can crack the PLU join.

---

## File Structure

```
Chiptole-Find/
├── app/
│   ├── page.tsx                        # Main UI: chain picker + search + map + card list
│   ├── layout.tsx                      # Root layout (from cheapotle)
│   ├── globals.css                     # (from cheapotle)
│   ├── components/
│   │   ├── ChainPicker.tsx             # NEW: row of chain chips
│   │   ├── Map.tsx                     # (from cheapotle, made chain-aware via accent color)
│   │   ├── LocationCard.tsx            # (from cheapotle, benchmark-item label param)
│   │   └── SearchBar.tsx               # (from cheapotle, unchanged)
│   └── api/
│       ├── geocode/route.ts            # (from cheapotle, unchanged — shared)
│       └── [chain]/
│           ├── stores/route.ts         # NEW: dispatches to provider.findStores
│           └── price/[storeId]/route.ts# NEW: dispatches to provider.getPrice
├── lib/
│   ├── chains/
│   │   ├── types.ts                    # NEW: ChainProvider, Store, PriceResult, ChainId
│   │   ├── registry.ts                 # NEW: id → provider map + getChain()
│   │   ├── chipotle.ts                 # NEW: Chipotle provider (ported from cheapotle routes)
│   │   ├── tacobell.ts                 # NEW: Taco Bell provider
│   │   ├── wendys.ts                   # NEW: Wendy's provider
│   │   └── burgerking.ts               # NEW: Burger King provider (stores live, price estimated)
│   ├── haversine.ts                    # (from cheapotle, unchanged)
│   └── cache.ts                        # NEW: tiny TTL cache helper (extracted, shared)
├── test-fixtures/                      # Real captured API responses (already saved)
│   ├── tacobell-stores.json
│   ├── tacobell-menu-036215.json
│   ├── wendys-stores.json
│   └── wendys-menu-1206.json
└── lib/chains/__tests__/               # Vitest unit tests per provider parser
```

**Key design decision:** each provider exposes two PURE parsing functions (`parseStores(json)`, `parsePrice(json)`) separately from the fetching, so tests run against saved fixtures with zero network. The `findStores`/`getPrice` methods just do `fetch` + call the pure parser.

---

## Task 1: Scaffold — fork cheapotle into the repo

**Files:**
- Copy cheapotle's `app/`, `lib/`, config files into repo root
- Modify: `package.json` (name, add vitest)

- [ ] **Step 1: Copy cheapotle source (excluding SEO/city pages we don't need yet)**

```bash
cd /Users/risus_zhao/Desktop/Apps/Chiptole-Find
# cheapotle already cloned at /tmp/cheapotle
cp -r /tmp/cheapotle/app ./app
cp -r /tmp/cheapotle/lib ./lib
cp -r /tmp/cheapotle/public ./public
cp /tmp/cheapotle/package.json /tmp/cheapotle/package-lock.json ./
cp /tmp/cheapotle/tsconfig.json /tmp/cheapotle/next.config.ts /tmp/cheapotle/postcss.config.mjs /tmp/cheapotle/eslint.config.mjs ./
cp /tmp/cheapotle/.gitignore ./
# Remove Chipotle-SEO-specific pages we are not carrying into the multi-chain MVP
rm -rf app/cheapest-chipotle-near-me app/cheapest-chipotle app/robots.ts app/sitemap.ts app/components/Footer.tsx app/components/WhyPricesVary.tsx app/components/ProteinSelector.tsx app/components/StoreDetailPanel.tsx lib/cities.ts lib/seo-data.ts lib/proteins.ts
```

- [ ] **Step 2: Install deps + add vitest**

```bash
npm install
npm install -D vitest
```

- [ ] **Step 3: Add test script to package.json**

Modify `package.json` `"scripts"` to include:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Also change `"name"` to `"chiptole-find"`.

- [ ] **Step 4: Verify dev server boots**

Run: `npm run build`
Expected: build fails or errors referencing removed imports (proteins, Footer). That's expected — next task fixes the app to compile. If it builds clean, even better.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: vendor cheapotle as multi-chain base"
```

---

## Task 2: Shared TTL cache helper

**Files:**
- Create: `lib/cache.ts`
- Test: `lib/__tests__/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/cache.test.ts
import { describe, it, expect, vi } from "vitest";
import { TTLCache } from "../cache";

describe("TTLCache", () => {
  it("returns a stored value before it expires", () => {
    const c = new TTLCache<number>(1000);
    c.set("k", 42);
    expect(c.get("k")).toBe(42);
  });

  it("returns undefined after the TTL elapses", () => {
    vi.useFakeTimers();
    const c = new TTLCache<number>(1000);
    c.set("k", 42);
    vi.advanceTimersByTime(1001);
    expect(c.get("k")).toBeUndefined();
    vi.useRealTimers();
  });

  it("returns undefined for a missing key", () => {
    const c = new TTLCache<number>(1000);
    expect(c.get("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/cache.test.ts`
Expected: FAIL — cannot find module `../cache`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cache.ts
export class TTLCache<T> {
  private store = new Map<string, { value: T; ts: number }>();
  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.ts >= this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, ts: Date.now() });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/cache.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cache.ts lib/__tests__/cache.test.ts
git commit -m "feat: shared TTL cache helper"
```

---

## Task 3: Chain types and registry

**Files:**
- Create: `lib/chains/types.ts`
- Create: `lib/chains/registry.ts`
- Test: `lib/chains/__tests__/registry.test.ts`

- [ ] **Step 1: Write the types (no test — pure type declarations)**

```ts
// lib/chains/types.ts
export type ChainId = "chipotle" | "tacobell" | "wendys" | "burgerking";

export interface Store {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface PriceResult {
  price: number;
  deliveryPrice?: number;
  isLive: boolean; // false => estimated fallback
}

export interface ChainMeta {
  id: ChainId;
  name: string;
  benchmarkItem: string;
  accentColor: string;   // hex, for markers/badges
  fallbackPrice: number; // national average, used when live price unavailable
}

export interface ChainProvider extends ChainMeta {
  findStores(lat: number, lng: number): Promise<Store[]>;
  getPrice(storeId: string): Promise<PriceResult>;
}
```

- [ ] **Step 2: Write the failing registry test**

```ts
// lib/chains/__tests__/registry.test.ts
import { describe, it, expect } from "vitest";
import { getChain, listChains } from "../registry";

describe("chain registry", () => {
  it("lists all four MVP chains", () => {
    expect(listChains().map((c) => c.id).sort()).toEqual(
      ["burgerking", "chipotle", "tacobell", "wendys"]
    );
  });

  it("returns a provider for a valid id", () => {
    expect(getChain("wendys")?.benchmarkItem).toBe("Dave's Single");
  });

  it("returns undefined for an unknown id", () => {
    // @ts-expect-error testing invalid id
    expect(getChain("subway")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/chains/__tests__/registry.test.ts`
Expected: FAIL — cannot find `../registry`.

- [ ] **Step 4: Write minimal registry (providers stubbed until later tasks)**

Create the four provider files as minimal stubs first so the registry imports resolve. Each stub exports a provider whose `findStores`/`getPrice` throw `new Error("not implemented")` but has correct metadata. Later tasks replace the bodies.

```ts
// lib/chains/chipotle.ts
import type { ChainProvider } from "./types";
export const chipotle: ChainProvider = {
  id: "chipotle",
  name: "Chipotle",
  benchmarkItem: "Chicken Bowl",
  accentColor: "#A81612",
  fallbackPrice: 9.65,
  async findStores() { throw new Error("not implemented"); },
  async getPrice() { throw new Error("not implemented"); },
};
```

```ts
// lib/chains/tacobell.ts
import type { ChainProvider } from "./types";
export const tacobell: ChainProvider = {
  id: "tacobell",
  name: "Taco Bell",
  benchmarkItem: "Crunchwrap Supreme",
  accentColor: "#702082",
  fallbackPrice: 6.49,
  async findStores() { throw new Error("not implemented"); },
  async getPrice() { throw new Error("not implemented"); },
};
```

```ts
// lib/chains/wendys.ts
import type { ChainProvider } from "./types";
export const wendys: ChainProvider = {
  id: "wendys",
  name: "Wendy's",
  benchmarkItem: "Dave's Single",
  accentColor: "#E2203B",
  fallbackPrice: 6.29,
  async findStores() { throw new Error("not implemented"); },
  async getPrice() { throw new Error("not implemented"); },
};
```

```ts
// lib/chains/burgerking.ts
import type { ChainProvider } from "./types";
export const burgerking: ChainProvider = {
  id: "burgerking",
  name: "Burger King",
  benchmarkItem: "Whopper",
  accentColor: "#B8531B",
  fallbackPrice: 7.19,
  async findStores() { throw new Error("not implemented"); },
  async getPrice() { throw new Error("not implemented"); },
};
```

```ts
// lib/chains/registry.ts
import type { ChainId, ChainProvider } from "./types";
import { chipotle } from "./chipotle";
import { tacobell } from "./tacobell";
import { wendys } from "./wendys";
import { burgerking } from "./burgerking";

const providers: Record<ChainId, ChainProvider> = {
  chipotle,
  tacobell,
  wendys,
  burgerking,
};

export function getChain(id: string): ChainProvider | undefined {
  return providers[id as ChainId];
}

export function listChains(): ChainProvider[] {
  return Object.values(providers);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/chains/__tests__/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/chains
git commit -m "feat: chain provider types and registry with stubs"
```

---

## Task 4: Taco Bell provider (parsers + fetch)

**Files:**
- Modify: `lib/chains/tacobell.ts`
- Create: `lib/chains/tacobell-parse.ts`
- Test: `lib/chains/__tests__/tacobell.test.ts`
- Uses fixtures: `test-fixtures/tacobell-stores.json`, `test-fixtures/tacobell-menu-036215.json`

- [ ] **Step 1: Write the failing parser test**

```ts
// lib/chains/__tests__/tacobell.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../tacobell-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("tacobell parsers", () => {
  it("parses nearby stores with id, coords, address", () => {
    const stores = parseStores(fixture("tacobell-stores.json"));
    expect(stores.length).toBeGreaterThan(0);
    const s = stores[0];
    expect(s.id).toBe("036215");
    expect(s.lat).toBeCloseTo(41.8764, 3);
    expect(s.lng).toBeCloseTo(-87.6289, 3);
    expect(s.address).toContain("Chicago");
  });

  it("parses the Crunchwrap Supreme price from a store menu", () => {
    const r = parsePrice(fixture("tacobell-menu-036215.json"));
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(8.49);
  });

  it("returns estimated when no matching item is present", () => {
    const r = parsePrice({ nothing: true });
    expect(r.isLive).toBe(false);
  });
});
```

Note: the trimmed menu fixture stores the item under `crunchwrapSupreme`. `parsePrice` must handle BOTH the trimmed shape and the real nested API shape (walk the tree for a product whose `code === "22362"` with a numeric `price.value`). Implement the tree-walk; then also check a top-level `crunchwrapSupreme` key as a fast path for the fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/chains/__tests__/tacobell.test.ts`
Expected: FAIL — cannot find `../tacobell-parse`.

- [ ] **Step 3: Implement the parsers**

```ts
// lib/chains/tacobell-parse.ts
import type { Store, PriceResult } from "./types";

const CRUNCHWRAP_CODE = "22362";
const FALLBACK = 6.49;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  const raw: any[] = json?.nearByStores ?? [];
  return raw
    .map((s) => {
      const lat = s?.geoPoint?.latitude;
      const lng = s?.geoPoint?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      const a = s?.address ?? {};
      const address = [a.line1, a.town, a.region?.isocode?.replace("US-", ""), a.postalCode]
        .filter(Boolean)
        .join(", ");
      return {
        id: String(s.storeNumber),
        name: `Taco Bell #${s.storeNumber}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  // Fast path for trimmed fixture
  const fast = json?.crunchwrapSupreme?.price?.value;
  if (typeof fast === "number" && fast > 0) {
    return { price: fast, isLive: true };
  }
  // Real API: walk tree for product code 22362 with a positive price
  let found: number | null = null;
  const walk = (o: any) => {
    if (found != null || o == null) return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (typeof o === "object") {
      if (o.code === CRUNCHWRAP_CODE && typeof o.price?.value === "number" && o.price.value > 0) {
        found = o.price.value;
        return;
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(json);
  return found != null ? { price: found, isLive: true } : { price: FALLBACK, isLive: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/chains/__tests__/tacobell.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire fetch into the provider**

```ts
// lib/chains/tacobell.ts
import type { ChainProvider } from "./types";
import { parseStores, parsePrice } from "./tacobell-parse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const tacobell: ChainProvider = {
  id: "tacobell",
  name: "Taco Bell",
  benchmarkItem: "Crunchwrap Supreme",
  accentColor: "#702082",
  fallbackPrice: 6.49,

  async findStores(lat, lng) {
    const url = `https://www.tacobell.com/tacobellwebservices/v4/tacobell/stores?latitude=${lat}&longitude=${lng}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Taco Bell stores HTTP ${res.status}`);
    return parseStores(await res.json());
  },

  async getPrice(storeId) {
    const url = `https://www.tacobell.com/tacobellwebservices/v2/tacobell/products/menu/${storeId}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS (all tests so far).

- [ ] **Step 7: Commit**

```bash
git add lib/chains/tacobell.ts lib/chains/tacobell-parse.ts lib/chains/__tests__/tacobell.test.ts
git commit -m "feat: Taco Bell chain provider with live pricing"
```

---

## Task 5: Wendy's provider (parsers + fetch)

**Files:**
- Modify: `lib/chains/wendys.ts`
- Create: `lib/chains/wendys-parse.ts`
- Test: `lib/chains/__tests__/wendys.test.ts`
- Uses fixtures: `test-fixtures/wendys-stores.json`, `test-fixtures/wendys-menu-1206.json`

- [ ] **Step 1: Write the failing parser test**

```ts
// lib/chains/__tests__/wendys.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStores, parsePrice } from "../wendys-parse";

const fixture = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../../test-fixtures", f), "utf8"));

describe("wendys parsers", () => {
  it("parses nearby stores with id, numeric coords, address", () => {
    const stores = parseStores(fixture("wendys-stores.json"));
    const s = stores[0];
    expect(s.id).toBe("1206");
    expect(typeof s.lat).toBe("number");
    expect(s.lat).toBeCloseTo(41.9029, 2);
    expect(s.address).toContain("CHICAGO");
  });

  it("parses the Dave's Single price from a site menu", () => {
    const r = parsePrice(fixture("wendys-menu-1206.json"));
    expect(r.isLive).toBe(true);
    expect(r.price).toBe(5.79);
  });

  it("returns estimated when no Dave's Single is present", () => {
    const r = parsePrice({ menuLists: [] });
    expect(r.isLive).toBe(false);
  });
});
```

Note: `parsePrice` must handle BOTH the trimmed fixture (`{ salesItems: [...] }`) and the real API shape (`{ menuLists: {...} }`) by tree-walking for an object with `alaCarteMenuItemId`, a `displayName` starting "Dave's Single", and a numeric `price` > 0.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/chains/__tests__/wendys.test.ts`
Expected: FAIL — cannot find `../wendys-parse`.

- [ ] **Step 3: Implement the parsers**

```ts
// lib/chains/wendys-parse.ts
import type { Store, PriceResult } from "./types";

const FALLBACK = 6.29;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  const raw: any[] = json?.data ?? [];
  return raw
    .map((s) => {
      const lat = parseFloat(s?.lat);
      const lng = parseFloat(s?.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      const address = [s.address1, s.city, s.address2].filter(Boolean).join(", ");
      return {
        id: String(s.id),
        name: `Wendy's – ${s.name ?? s.address1}`,
        address,
        lat,
        lng,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  let found: number | null = null;
  const consider = (o: any) => {
    if (
      o &&
      typeof o === "object" &&
      "alaCarteMenuItemId" in o &&
      String(o.displayName ?? "").toLowerCase().startsWith("dave's single") &&
      typeof o.price === "number" &&
      o.price > 0
    ) {
      if (found == null || o.price < found) found = o.price;
    }
  };
  const walk = (o: any) => {
    if (o == null) return;
    consider(o);
    if (Array.isArray(o)) o.forEach(walk);
    else if (typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(json);
  return found != null ? { price: found, isLive: true } : { price: FALLBACK, isLive: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/chains/__tests__/wendys.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire fetch into the provider**

```ts
// lib/chains/wendys.ts
import type { ChainProvider } from "./types";
import { parseStores, parsePrice } from "./wendys-parse";

const BASE = "https://digitalservices.prod.ext-aws.wendys.com";
const COMMON = "lang=en&cntry=US&sourceCode=ORDER.WENDYS&version=20.0.0";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const wendys: ChainProvider = {
  id: "wendys",
  name: "Wendy's",
  benchmarkItem: "Dave's Single",
  accentColor: "#E2203B",
  fallbackPrice: 6.29,

  async findStores(lat, lng) {
    const url = `${BASE}/LocationServices/rest/nearbyLocations?${COMMON}&lat=${lat}&long=${lng}&limit=25&filterSearch=false&radius=25`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Wendy's stores HTTP ${res.status}`);
    return parseStores(await res.json());
  },

  async getPrice(storeId) {
    const url = `${BASE}/menu/getSiteMenu?${COMMON}&siteNum=${storeId}&menuChannel=WEB_GUEST`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/chains/wendys.ts lib/chains/wendys-parse.ts lib/chains/__tests__/wendys.test.ts
git commit -m "feat: Wendy's chain provider with live pricing"
```

---

## Task 6: Chipotle provider (port from cheapotle)

**Files:**
- Modify: `lib/chains/chipotle.ts`
- Create: `lib/chains/chipotle-parse.ts`
- Test: `lib/chains/__tests__/chipotle.test.ts`

- [ ] **Step 1: Write the failing parser test**

```ts
// lib/chains/__tests__/chipotle.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/chains/__tests__/chipotle.test.ts`
Expected: FAIL — cannot find `../chipotle-parse`.

- [ ] **Step 3: Implement the parsers (ported from cheapotle routes)**

```ts
// lib/chains/chipotle-parse.ts
import type { Store, PriceResult } from "./types";

const FALLBACK = 9.65;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  const raw: any[] = json?.data ?? [];
  return raw
    .map((s) => {
      if (s?.restaurantStatus !== "OPEN") return null;
      const addr = s?.addresses?.[0];
      if (!addr?.latitude || !addr?.longitude) return null;
      const address = [addr.addressLine1, addr.locality, addr.administrativeArea, addr.postalCode]
        .filter(Boolean)
        .join(", ");
      return {
        id: String(s.restaurantNumber),
        name: `Chipotle – ${s.restaurantName}`,
        address,
        lat: addr.latitude,
        lng: addr.longitude,
      } as Store;
    })
    .filter(Boolean) as Store[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePrice(json: any): PriceResult {
  const entrees: any[] = json?.entrees ?? [];
  for (const e of entrees) {
    const name = String(e?.itemName ?? "").toLowerCase();
    const type = String(e?.itemType ?? "").toLowerCase();
    const isChickenBowl = name.includes("chicken") && (name.includes("bowl") || type.includes("bowl"));
    if (isChickenBowl) {
      const price = Number(e?.unitPrice ?? 0);
      if (price > 0) {
        return { price, deliveryPrice: Number(e?.unitDeliveryPrice ?? price), isLive: true };
      }
    }
  }
  return { price: FALLBACK, isLive: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/chains/__tests__/chipotle.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire fetch into the provider (multi-page store search from cheapotle)**

```ts
// lib/chains/chipotle.ts
import type { ChainProvider, Store } from "./types";
import { parseStores, parsePrice } from "./chipotle-parse";

const BASE = "https://services.chipotle.com";
const KEY = "b4d9f36380184a3788857063bce25d6a";
const HEADERS = {
  "Ocp-Apim-Subscription-Key": KEY,
  "Content-Type": "application/json",
  Origin: "https://chipotle.com",
  Referer: "https://chipotle.com/order",
};

export const chipotle: ChainProvider = {
  id: "chipotle",
  name: "Chipotle",
  benchmarkItem: "Chicken Bowl",
  accentColor: "#A81612",
  fallbackPrice: 9.65,

  async findStores(lat, lng) {
    const res = await fetch(`${BASE}/restaurant/v3/restaurant`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
        radius: 9999,
        pageSize: 20,
        pageIndex: 0,
        embeds: { addressTypes: ["MAIN"] },
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Chipotle stores HTTP ${res.status}`);
    const stores: Store[] = parseStores(await res.json());
    // Dedupe by id
    const seen = new Set<string>();
    return stores.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  },

  async getPrice(storeId) {
    const res = await fetch(
      `${BASE}/menuinnovation/v1/restaurants/${storeId}/onlinemenu?channelId=web&includeUnavailableItems=false`,
      { headers: HEADERS, signal: AbortSignal.timeout(10_000), cache: "no-store" }
    );
    if (!res.ok) return { price: this.fallbackPrice, isLive: false };
    return parsePrice(await res.json());
  },
};
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/chains/chipotle.ts lib/chains/chipotle-parse.ts lib/chains/__tests__/chipotle.test.ts
git commit -m "feat: Chipotle chain provider ported to provider interface"
```

---

## Task 7: Burger King provider (live stores, estimated price)

**Files:**
- Modify: `lib/chains/burgerking.ts`
- Create: `lib/chains/burgerking-parse.ts`
- Test: `lib/chains/__tests__/burgerking.test.ts`

- [ ] **Step 1: Write the failing parser test**

```ts
// lib/chains/__tests__/burgerking.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/chains/__tests__/burgerking.test.ts`
Expected: FAIL — cannot find `../burgerking-parse`.

- [ ] **Step 3: Implement the parser**

```ts
// lib/chains/burgerking-parse.ts
import type { Store } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStores(json: any): Store[] {
  const raw: any[] = json?.data?.restaurants?.nodes ?? [];
  return raw
    .map((s) => {
      if (typeof s?.latitude !== "number" || typeof s?.longitude !== "number") return null;
      const a = s?.physicalAddress ?? {};
      const address = [a.address1, a.city, a.stateProvince, a.postalCode].filter(Boolean).join(", ");
      return {
        id: String(s.storeId),
        name: `Burger King – ${a.city ?? s.storeId}`,
        address,
        lat: s.latitude,
        lng: s.longitude,
      } as Store;
    })
    .filter(Boolean) as Store[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/chains/__tests__/burgerking.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire fetch; getPrice returns the estimated fallback for every store**

```ts
// lib/chains/burgerking.ts
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
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/chains/burgerking.ts lib/chains/burgerking-parse.ts lib/chains/__tests__/burgerking.test.ts
git commit -m "feat: Burger King provider — live stores, estimated Whopper price"
```

---

## Task 8: Chain-parameterized API routes

**Files:**
- Create: `app/api/[chain]/stores/route.ts`
- Create: `app/api/[chain]/price/[storeId]/route.ts`
- Delete: old `app/api/stores/route.ts`, `app/api/price/[storeId]/route.ts`
- Keep: `app/api/geocode/route.ts` (unchanged)

- [ ] **Step 1: Write the stores route**

```ts
// app/api/[chain]/stores/route.ts
import { NextResponse } from "next/server";
import { getChain } from "@/lib/chains/registry";
import { TTLCache } from "@/lib/cache";
import type { Store } from "@/lib/chains/types";

const cache = new TTLCache<Store[]>(5 * 60 * 1000);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chain: string }> }
) {
  const { chain: chainId } = await params;
  const provider = getChain(chainId);
  if (!provider) return NextResponse.json({ error: "Unknown chain" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const key = `${chainId}:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ stores: hit, fromCache: true });

  try {
    const stores = await provider.findStores(lat, lng);
    if (stores.length === 0) {
      return NextResponse.json({ error: "No locations found near you." }, { status: 404 });
    }
    cache.set(key, stores);
    return NextResponse.json({ stores, fromCache: false });
  } catch (err) {
    console.error(`[/api/${chainId}/stores]`, err);
    return NextResponse.json({ error: "Failed to fetch locations." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the price route**

```ts
// app/api/[chain]/price/[storeId]/route.ts
import { NextResponse } from "next/server";
import { getChain } from "@/lib/chains/registry";
import { TTLCache } from "@/lib/cache";
import type { PriceResult } from "@/lib/chains/types";

const cache = new TTLCache<PriceResult>(5 * 60 * 1000);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chain: string; storeId: string }> }
) {
  const { chain: chainId, storeId } = await params;
  const provider = getChain(chainId);
  if (!provider) return NextResponse.json({ error: "Unknown chain" }, { status: 404 });

  const key = `${chainId}:${storeId}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ ...hit, fromCache: true });

  try {
    const result = await provider.getPrice(storeId);
    cache.set(key, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[/api/${chainId}/price/${storeId}]`, err);
    return NextResponse.json({ price: provider.fallbackPrice, isLive: false });
  }
}
```

- [ ] **Step 3: Delete the old single-chain routes**

```bash
rm -rf app/api/stores app/api/price
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build`
Expected: PASS (routes compile; note `app/page.tsx` still references old routes — that's fixed in Task 9. If build fails ONLY on page.tsx imports, that is acceptable at this checkpoint; proceed to Task 9. If it fails on the new route files, fix them.)

- [ ] **Step 5: Commit**

```bash
git add app/api
git commit -m "feat: chain-parameterized stores and price API routes"
```

---

## Task 9: Chain picker + wire the UI to multi-chain routes

**Files:**
- Create: `app/components/ChainPicker.tsx`
- Modify: `app/page.tsx`
- Modify: `app/components/Map.tsx` (accept accent color), `app/components/LocationCard.tsx` (benchmark label, estimated badge)

Because cheapotle's `page.tsx` is Chipotle-specific, this task rewrites its data-fetching to be chain-driven. The exact original `page.tsx` is long; the steps below give the complete replacement structure. Read the current `app/page.tsx` first to preserve its map/list layout and styling classes.

- [ ] **Step 1: Write ChainPicker component**

```tsx
// app/components/ChainPicker.tsx
"use client";
import type { ChainMeta } from "@/lib/chains/types";

export function ChainPicker({
  chains,
  selected,
  onSelect,
}: {
  chains: ChainMeta[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {chains.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
            selected === c.id ? "text-white" : "bg-gray-100 text-gray-700"
          }`}
          style={selected === c.id ? { backgroundColor: c.accentColor } : undefined}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add a client-safe chain metadata list**

The registry imports provider modules that use server-only `fetch`; that is fine in Next.js (fetch exists on client too), but to keep the picker light, expose a plain metadata array.

```ts
// lib/chains/meta.ts
import type { ChainMeta } from "./types";
export const CHAIN_META: ChainMeta[] = [
  { id: "chipotle", name: "Chipotle", benchmarkItem: "Chicken Bowl", accentColor: "#A81612", fallbackPrice: 9.65 },
  { id: "tacobell", name: "Taco Bell", benchmarkItem: "Crunchwrap Supreme", accentColor: "#702082", fallbackPrice: 6.49 },
  { id: "wendys", name: "Wendy's", benchmarkItem: "Dave's Single", accentColor: "#E2203B", fallbackPrice: 6.29 },
  { id: "burgerking", name: "Burger King", benchmarkItem: "Whopper", accentColor: "#B8531B", fallbackPrice: 7.19 },
];
```

- [ ] **Step 3: Read the current page.tsx, then rewrite fetch calls to be chain-aware**

Read `app/page.tsx`. Change every `fetch("/api/stores?...")` to `fetch(\`/api/${chain}/stores?...\`)` and `fetch(\`/api/price/${id}?...\`)` to `fetch(\`/api/${chain}/price/${id}\`)`. Add:
- `const [chain, setChain] = useState("chipotle");`
- Render `<ChainPicker chains={CHAIN_META} selected={chain} onSelect={setChain} />` above the search bar.
- A `useEffect` on `[chain]` that, if a location/search is already set, refetches stores + prices for the new chain.
- Pass the selected chain's `accentColor` to `<Map>` and its `benchmarkItem` to `<LocationCard>`.
- Remove any `ProteinSelector` usage and the `protein` query param (dropped in MVP).

- [ ] **Step 4: Update LocationCard to show benchmark label + estimated badge**

In `app/components/LocationCard.tsx`, add props `benchmarkItem: string` and use the `isLive` flag already present: when `isLive === false`, render an "estimated" badge instead of "live". Show the `benchmarkItem` name near the price.

- [ ] **Step 5: Update Map to use the chain accent color**

In `app/components/Map.tsx`, add an `accentColor?: string` prop and use it for the non-cheapest markers (keep the green "cheapest" marker distinct).

- [ ] **Step 6: Verify build + typecheck**

Run: `npm run build`
Expected: PASS with no type errors.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`, open http://localhost:3000. For each chain chip, search "Chicago, IL" and confirm markers + a ranked card list appear. Chipotle/Taco Bell/Wendy's show live prices; Burger King shows estimated prices with the estimated badge.

- [ ] **Step 8: Commit**

```bash
git add app lib/chains/meta.ts
git commit -m "feat: chain picker and multi-chain UI wiring"
```

---

## Task 10: Live smoke-test script

**Files:**
- Create: `scripts/smoke.ts`

- [ ] **Step 1: Write the script**

```ts
// scripts/smoke.ts
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
      console.log(
        `${chain.name}: ${stores.length} stores; ${first?.name ?? "-"} → ` +
          (price ? `$${price.price} (${price.isLive ? "live" : "estimated"})` : "no price")
      );
    } catch (err) {
      console.log(`${chain.name}: ERROR ${(err as Error).message}`);
    }
  }
}
main();
```

- [ ] **Step 2: Add script to package.json**

```json
"smoke": "tsx scripts/smoke.ts"
```

Install tsx if needed: `npm install -D tsx`.

- [ ] **Step 3: Run it**

Run: `npm run smoke`
Expected: Each of the four chains prints a store count and a price. Chipotle/Taco Bell/Wendy's say `live`; Burger King says `estimated`. If a chain errors, note it — the app still degrades gracefully, but investigate before deploy.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.ts package.json
git commit -m "chore: live multi-chain smoke-test script"
```

---

## Task 11: README + deploy

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README**

Describe the multi-chain app, the four chains, benchmark items, the estimated-vs-live distinction (Burger King is estimated in MVP), no-API-keys setup, and the unofficial-integration disclaimer. Credit cheapotle (MIT) as the base.

- [ ] **Step 2: Final full-suite run**

Run: `npx vitest run && npm run build`
Expected: All tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: multi-chain README"
```

- [ ] **Step 4: Deploy to Vercel (optional, on user go-ahead)**

Run: `vercel deploy` (or use the vercel:deploy skill). No env vars required.

---

## Self-Review Notes

- **Spec coverage:** chain selector (Task 9), ChainProvider interface (Task 3), per-chain routes (Task 8), Chipotle/Taco Bell/Wendy's/Burger King providers (Tasks 4–7), 5-min cache (Task 2/8), progressive loading (preserved from cheapotle in Task 9), estimated fallback + status (built into every provider's `getPrice` + LocationCard badge), geocoding/Haversine/map reuse (Task 1), fixture-based unit tests (Tasks 4–7), smoke script (Task 10). All covered.
- **Spec deviation (documented):** Burger King ships estimated-only, not live-priced. This is explicitly permitted by the spec's de-risking rule; verified during planning that per-store BK pricing needs a fragile Sanity-CMS PLU join. Wendy's and Taco Bell upgraded to high-confidence (both verified live).
- **Type consistency:** `Store`, `PriceResult`, `ChainProvider`, `ChainMeta`, `ChainId` defined once in `types.ts`; `parseStores`/`parsePrice` signatures consistent across all four provider parse modules; `getChain`/`listChains` names consistent between registry and consumers.
- **Progressive loading note:** cheapotle's page prices the ~10 closest stores first then the rest; Task 9 preserves that logic while swapping the fetch URLs — the reviewer implementing Task 9 must keep that batching, not replace it with a single blocking fetch.
