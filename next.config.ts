import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["jsdom", "@lancedb/lancedb", "apache-arrow", "pdf-parse"]
};

export default nextConfig;
