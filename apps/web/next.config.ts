import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every dashboard page depends on the signed-in user, so pages render per request.
  // Cache Components can be revisited once public pages (pricing, docs) grow.
  poweredByHeader: false,
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
