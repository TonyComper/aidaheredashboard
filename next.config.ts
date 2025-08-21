import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow builds to succeed even if ESLint finds errors.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
