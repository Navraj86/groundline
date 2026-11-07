import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every dashboard page depends on the signed-in user, so pages render per request.
  // Cache Components can be revisited once public pages (pricing, docs) grow.
  poweredByHeader: false,
  agentRules: false,
  experimental: {
    // Knowledge base uploads go through a server action: 20 MB files plus multipart overhead.
    serverActions: { bodySizeLimit: "21mb" },
    proxyClientMaxBodySize: "21mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
