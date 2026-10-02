import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  distDir: process.env.ASCENDRY_NEXT_DIST_DIR?.trim() || ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ["highs", "json-bigint", "z3-solver"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.jsdelivr.net" }],
  },
};

export default nextConfig;
