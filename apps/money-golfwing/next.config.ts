import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 証憑アップロード（スマホ撮影の画像/PDF）のため既定1MB→8MBへ
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
