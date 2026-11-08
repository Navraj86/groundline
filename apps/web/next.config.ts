import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every dashboard page depends on the signed-in user, so pages render per request.
  // Cache Components can be revisited once public pages (pricing, docs) grow.
  poweredByHeader: false,
  // A self-contained server for the Docker image. Tracing starts at the monorepo root so the
  // workspace packages the app imports are included.
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
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
