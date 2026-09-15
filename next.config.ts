import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["jsdom", "@lancedb/lancedb", "apache-arrow", "pdf-parse"]
};

export default nextConfig;
