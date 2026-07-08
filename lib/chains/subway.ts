import type { ChainProvider, Store, PriceResult } from "./types";
import { parseStores, parsePrice } from "./subway-parse";
import { haversineDistance } from "../haversine";
import { withBrowserSession, type FetchJson, type RunInPage } from "../scrape/browser";
import { kvGet, kvSet } from "../scrape/cache";

const ORIGIN = "https://www.subway.com/en-us/locator";
const API = "https://www.subway.com/api";
const STORE_TTL = 3600; // 1h
const PRICE_TTL = 43200; // 12h — scraped prices change rarely
const PREWARM = 8; // price the nearest N stores in the same browser session

const storesKey = (lat: number, lng: number) =>
  `subway:stores:${lat.toFixed(2)},${lng.toFixed(2)}`;
const priceKey = (storeId: string) => `subway:price:${storeId}`;

/**
 * Only location-search needs auth; store-menu is public (confirmed live 2026-07-08).
 * Subway's own front-end JS mints a short-lived guest bearer JWT client-side the
 * first time a user interacts with the locator's search box — there is no
 * dedicated token endpoint (a full network capture during that flow showed zero
 * auth/token/oauth requests). We reproduce that interaction with synthetic DOM
 * events (no Playwright input simulation available through the fetchJson-only
 * contract) via `runInPage`, then read the token back off a monkey-patched
 * `window.fetch` — this must run in-session so Akamai + the app's own React state
 * stay intact. The mint is a real signed JWT (HS256); a fabricated token with the
 * same claims is rejected, so this UI-interaction step is not optional.
 */
async function mintGuestToken(runInPage: RunInPage): Promise<string | null> {
  // NOTE: kept as ONE flat anonymous arrow with no separately-bound named inner
  // functions. Playwright serializes this via `.toString()` and re-evaluates it in
  // an isolated page context; some dev-mode TS/esbuild transforms (e.g. tsx) wrap
  // `const x = (...) => {...}` closures in a `__name(fn, "x")` helper call that
  // does not exist in that isolated context, which throws a ReferenceError. A flat
  // function body with no such bindings sidesteps that entirely.
  return runInPage<string | null, undefined>(async () => {
    return new Promise((resolve) => {
      const state = { resolved: false };
      const origFetch = window.fetch;
      window.fetch = ((...args: Parameters<typeof fetch>) => {
        if (!state.resolved) {
          try {
            const [reqUrl, init] = args;
            const urlStr = typeof reqUrl === "string" ? reqUrl : (reqUrl as Request)?.url || "";
            if (urlStr.includes("location-search")) {
              const headers = init?.headers;
              let auth: string | null = null;
              if (headers instanceof Headers) {
                auth = headers.get("authorization");
              } else if (Array.isArray(headers)) {
                // Header casing varies by caller (Subway's own client sends
                // "Authorization"); fetch's Headers lookup is case-insensitive but a
                // plain object/array literal is not, so match case-insensitively.
                const found = (headers as [string, string][]).find(
                  ([k]) => k.toLowerCase() === "authorization"
                );
                auth = found ? found[1] : null;
              } else if (headers) {
                const rec = headers as Record<string, string>;
                const key = Object.keys(rec).find((k) => k.toLowerCase() === "authorization");
                auth = key ? rec[key] : null;
              }
              if (auth) {
                state.resolved = true;
                window.fetch = origFetch;
                resolve(auth);
              }
            }
          } catch {
            /* ignore header-parsing errors, fall through to real fetch */
          }
        }
        return origFetch.apply(window, args);
      }) as typeof fetch;

      const input = document.querySelector<HTMLInputElement>(
        'input[placeholder="Search city, state or zip"]'
      );
      if (!input) {
        window.fetch = origFetch;
        resolve(null);
        return;
      }
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
        ?.set;
      setter?.call(input, "10001"); // throwaway zip — only used to mint the token
      input.dispatchEvent(new Event("input", { bubbles: true }));
      setTimeout(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      }, 300);

      setTimeout(() => {
        if (!state.resolved) {
          state.resolved = true;
          window.fetch = origFetch;
          resolve(null); // give up if no token appears
        }
      }, 8000);
    });
  });
}

async function searchStores(
  fetchJson: FetchJson,
  token: string,
  lat: number,
  lng: number
): Promise<Store[]> {
  const data = await fetchJson(`${API}/location-search`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify({
      customerPreferences: { useMetricUnits: false, culture: "en-us", country: "US", isRtl: false },
      searchOptions: { searchType: "BY_GEO", latitude: lat, longitude: lng },
      paging: { startOffset: "", pageSize: 15 },
      filters: [],
    }),
  });
  return parseStores(data);
}

// store-menu needs no auth token (confirmed live 2026-07-08).
async function menuPrice(fetchJson: FetchJson, storeId: string): Promise<PriceResult> {
  const data = await fetchJson(`${API}/store-menu/${storeId}?locale=en-us`);
  return parsePrice(data);
}

export const subway: ChainProvider = {
  id: "subway",
  name: "Subway",
  benchmarkItem: "Footlong Italian B.M.T.",
  accentColor: "#008C15",
  fallbackPrice: 9.49,

  async findStores(lat, lng) {
    const cached = await kvGet<Store[]>(storesKey(lat, lng));
    if (cached) return cached;

    const { data, ok } = await withBrowserSession(ORIGIN, async (fetchJson, runInPage) => {
      const token = await mintGuestToken(runInPage);
      if (!token) return [];

      const found = await searchStores(fetchJson, token, lat, lng);
      const nearest = found
        .map((s) => ({ s, d: haversineDistance(lat, lng, s.lat, s.lng) }))
        .sort((a, b) => a.d - b.d)
        .map((x) => x.s)
        .slice(0, 12);

      // Pre-warm prices for the closest stores in the same session so the UI's
      // progressive per-store price calls hit the cache instead of launching a browser each.
      for (const store of nearest.slice(0, PREWARM)) {
        try {
          const price = await menuPrice(fetchJson, store.id);
          await kvSet(priceKey(store.id), price, PRICE_TTL);
        } catch {
          /* skip a failed store, keep prewarming the rest */
        }
      }
      return nearest;
    });

    if (!ok || !data) return [];
    await kvSet(storesKey(lat, lng), data, STORE_TTL);
    return data;
  },

  async getPrice(storeId) {
    const cached = await kvGet<PriceResult>(priceKey(storeId));
    if (cached) return cached;

    const { data, ok } = await withBrowserSession(ORIGIN, async (fetchJson) =>
      menuPrice(fetchJson, storeId)
    );
    if (!ok || !data) return { price: this.fallbackPrice, isLive: false };
    await kvSet(priceKey(storeId), data, PRICE_TTL);
    return data;
  },
};
