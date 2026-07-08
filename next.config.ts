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
};

export default nextConfig;