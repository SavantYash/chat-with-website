import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["jsdom", "@lancedb/lancedb", "apache-arrow", "pdf-parse", "pdfjs-dist", "@napi-rs/canvas"]
};

export default nextConfig;
