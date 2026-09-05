import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/* はTSソースのまま提供されるため必須（ask-data・閲覧計測など）
  transpilePackages: ["@yozan/core", "@yozan/track", "@yozan/content"],
  // 入会控えPDF（#129）の日本語フォント。fsで読むためトレースに含める
  outputFileTracingIncludes: {
    "/api/public/frank/pos/webhook": ["./src/assets/**"],
    // 領収書PDF（#222）も同じ日本語フォントを読む
    "/api/public/frank/admin/receipt": ["./src/assets/**"],
  },
  experimental: {
    serverActions: {
      // 資料室(/library)のアップロード上限（actions.ts側は25MBで検証）
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
