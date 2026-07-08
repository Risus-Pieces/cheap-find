import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "www.chipotle.com" },
    ],
  },
  // Keep the headless-browser deps out of the server bundle so @sparticuz/chromium
  // resolves its packaged binary at runtime (bundling breaks executablePath()).
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  // ...but file-tracing only follows import/require, so it misses data files these
  // packages load by computed path (e.g. playwright-core/browsers.json, the chromium
  // binary). Force the whole packages into the scraped-chain API functions so they
  // exist at runtime in /var/task/node_modules.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
  },
};

export default nextConfig;
