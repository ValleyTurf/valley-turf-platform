import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Visit note photos (customers/[id]/AddVisitNoteForm.tsx,
  // my-day/VisitNoteForm.tsx) upload straight through Server Actions,
  // which cap request bodies at 1MB by default — nowhere near enough for
  // even one real phone camera photo (commonly 3-8MB), let alone the
  // "multiple" file input letting someone attach several at once. Without
  // this, a photo upload just fails outright (looks like "page couldn't
  // load" on mobile) rather than a clean, catchable error. 15mb covers a
  // handful of typical phone photos in one note; if this turns out to be
  // too tight in practice, raise it further before switching to a
  // streaming Route Handler (the officially recommended approach for
  // genuinely large uploads, but more work than this app's photo sizes
  // currently justify).
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
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