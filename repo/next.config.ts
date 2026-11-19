import type { NextConfig } from "next";

const isStaticExport = process.env.BUILD_STATIC === "1";

const nextConfig: NextConfig = {
  // Default: standard server build. For Firebase Hosting, run
  // `npm run build:static` which sets BUILD_STATIC=1 and emits a fully static
  // site into ./out — the whole app is client-side, so the static export is
  // complete and survives offline via the service worker.
  ...(isStaticExport
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : { output: "standalone" as const }),
  reactStrictMode: false,
};

export default nextConfig;
