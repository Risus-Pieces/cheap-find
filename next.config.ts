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
};

export default nextConfig;
