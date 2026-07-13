import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 資料室(/library)のアップロード上限（actions.ts側は25MBで検証）
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
