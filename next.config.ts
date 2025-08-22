/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ⚠️ Warning: this allows builds with lint errors
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
