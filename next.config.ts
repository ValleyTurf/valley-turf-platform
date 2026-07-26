import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/:slug",
        destination: "/r/:slug",
      },
    ];
  },
  async headers() {
    return [
      {
        // Browsers already refuse to cache a service worker script for
        // more than 24h, but CDNs/proxies don't know that rule — this
        // makes sure a fixed sw.js reaches installed devices as fast as
        // possible instead of sitting behind Vercel's default static
        // caching for the public/ folder.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;