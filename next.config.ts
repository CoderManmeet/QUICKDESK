import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Ticket forms upload up to 5 files of 10 MB each through server actions.
    // Both limits are needed: the middleware buffers request bodies too.
    serverActions: { bodySizeLimit: "52mb" },
    middlewareClientMaxBodySize: "52mb",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
