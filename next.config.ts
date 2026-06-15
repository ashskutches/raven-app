import type { NextConfig } from "next";

const RAVEN_API = process.env.RAVEN_API_URL
  ?? process.env.NEXT_PUBLIC_RAVEN_API_URL
  ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${RAVEN_API}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
};

export default nextConfig;
