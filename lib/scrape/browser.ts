/**
 * Headless-browser session helper for chains whose ordering sites are behind an
 * Akamai bot-wall that silently drops plain server-side fetches. A real browser
 * clears the wall (executes the challenge JS), after which we call the chain's own
 * JSON menu/locator API from inside the page session.
 *
 * The browser backend is swappable via env so we can move off Vercel's datacenter
 * IP (which Akamai may treat harshly) without touching any provider code:
 *   SCRAPE_BROWSER = "local" | "vercel" | "browserless"
 * Default: "vercel" in production, "local" otherwise.
 */

/** In-page fetch that returns parsed JSON (or null on non-JSON / error). */
export type FetchJson = (url: string, init?: RequestInit) => Promise<unknown>;

export interface ScrapeResult<T> {
  data: T | null;
  ok: boolean;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const NAV_TIMEOUT_MS = 35_000;
const CHALLENGE_SETTLE_MS = 6_000;

function backend(): "local" | "vercel" | "browserless" {
  const env = process.env.SCRAPE_BROWSER;
  if (env === "local" || env === "vercel" || env === "browserless") return env;
  return process.env.NODE_ENV === "production" ? "vercel" : "local";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function launch(): Promise<any> {
  const which = backend();
  if (which === "browserless") {
    const { chromium } = await import("playwright-core");
    const ws = process.env.BROWSERLESS_WS;
    if (!ws) throw new Error("BROWSERLESS_WS not set");
    return chromium.connectOverCDP(ws);
  }
  if (which === "vercel") {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: pw } = await import("playwright-core");
    return pw.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // local: full playwright + stealth
  const { chromium } = await import("playwright-extra");
  const stealth = (await import("puppeteer-extra-plugin-stealth")).default;
  // stealth is idempotent to register
  (chromium as any).use(stealth());
  return (chromium as any).launch({
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Open a browser, navigate to `origin` to clear the wall, then run `inPage` with a
 * same-session `fetchJson`. Never throws — returns `{ data: null, ok: false }` on any
 * failure so callers degrade gracefully.
 */
export async function withBrowserSession<T>(
  origin: string,
  inPage: (fetchJson: FetchJson) => Promise<T>
): Promise<ScrapeResult<T>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null;
  try {
    browser = await launch();
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(CHALLENGE_SETTLE_MS);

    const fetchJson: FetchJson = async (url, init) => {
      // Serialize only the fetch-init subset that survives structured cloning.
      const safeInit = init
        ? { method: init.method, headers: init.headers, body: init.body }
        : undefined;
      return page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async ({ url, init }: any) => {
          try {
            const r = await fetch(url, {
              ...(init || {}),
              headers: { accept: "application/json", ...((init && init.headers) || {}) },
              credentials: "include",
            });
            const text = await r.text();
            try {
              return JSON.parse(text);
            } catch {
              return null;
            }
          } catch {
            return null;
          }
        },
        { url, init: safeInit }
      );
    };

    const data = await inPage(fetchJson);
    return { data, ok: true };
  } catch {
    return { data: null, ok: false };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore close errors */
      }
    }
  }
}
