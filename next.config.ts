import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The Dockerfile copies .next/standalone, which only exists with this set.
   * Without it the image build fails at the COPY step.
   */
  output: "standalone",
};

export default nextConfig;
