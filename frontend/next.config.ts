import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output => tiny production Docker image.
  output: "standalone",
  experimental: {
    // Server Actions body size guard.
    serverActions: { bodySizeLimit: "1mb" },
    // Client router cache: a dashboard page revisited within 30 s is served
    // from the cache instead of a new RSC round trip (Next 15 default is 0 s
    // for dynamic segments).
    staleTimes: { dynamic: 30, static: 180 },
  },
  // Proxy the API through the Next origin so the HttpOnly refresh cookie is
  // first-party in every environment (dev without nginx included). The browser
  // talks to /api/v1/* on :3000; Next forwards to the FastAPI service.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000/api/v1";
    // The SAP Integration microservice owns /api/v1/sap/* and runs as its own
    // process (see services/sap-integration/). Route it there first; everything
    // else falls through to the monolith / gateway.
    const sapTarget = process.env.SAP_PROXY_TARGET ?? "http://127.0.0.1:8001/api/v1/sap";
    // The Masterdata microservice owns /api/v1/masterdata/* and runs as its own
    // process (see services/masterdata/).
    const masterdataTarget =
      process.env.MASTERDATA_PROXY_TARGET ?? "http://127.0.0.1:8002/api/v1/masterdata";
    // The Rack microservice owns /api/v1/rack/* and runs as its own process
    // (see services/rack/).
    const rackTarget =
      process.env.RACK_PROXY_TARGET ?? "http://127.0.0.1:8003/api/v1/rack";
    // The Status microservice owns /api/v1/status/* — the single source of truth
    // for where a SAP line is in the flow (see services/status/).
    const statusTarget =
      process.env.STATUS_PROXY_TARGET ?? "http://127.0.0.1:8004/api/v1/status";
    return [
      { source: "/api/v1/sap/:path*", destination: `${sapTarget}/:path*` },
      { source: "/api/v1/masterdata/:path*", destination: `${masterdataTarget}/:path*` },
      { source: "/api/v1/rack/:path*", destination: `${rackTarget}/:path*` },
      { source: "/api/v1/status/:path*", destination: `${statusTarget}/:path*` },
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
