import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 보안 점검 SEC-003: "Next.js로 만들었음" 표시를 숨기고, 보안 헤더를 붙인다.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // 다른 사이트가 이 앱을 액자처럼 끼워 넣지 못하게
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
