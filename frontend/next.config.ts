import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output => tiny production Docker image.
  output: "standalone",
  experimental: {
    // Server Actions body size guard.
    serverActions: { bodySizeLimit: "1mb" },
  },
  // Proxy the API through the Next origin so the HttpOnly refresh cookie is
  // first-party in every environment (dev without nginx included). The browser
  // talks to /api/v1/* on :3000; Next forwards to the FastAPI service.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? "http://localhost:8000/api/v1";
    // The SAP Integration microservice owns /api/v1/sap/* and runs as its own
    // process (see services/sap-integration/). Route it there first; everything
    // else falls through to the monolith / gateway.
    const sapTarget = process.env.SAP_PROXY_TARGET ?? "http://localhost:8001/api/v1/sap";
    // The Masterdata microservice owns /api/v1/masterdata/* and runs as its own
    // process (see services/masterdata/).
    const masterdataTarget =
      process.env.MASTERDATA_PROXY_TARGET ?? "http://localhost:8002/api/v1/masterdata";
    // The Rack microservice owns /api/v1/rack/* and runs as its own process
    // (see services/rack/).
    const rackTarget =
      process.env.RACK_PROXY_TARGET ?? "http://localhost:8003/api/v1/rack";
    return [
      { source: "/api/v1/sap/:path*", destination: `${sapTarget}/:path*` },
      { source: "/api/v1/masterdata/:path*", destination: `${masterdataTarget}/:path*` },
      { source: "/api/v1/rack/:path*", destination: `${rackTarget}/:path*` },
      { source: "/api/v1/:path*", destination: `${target}/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
