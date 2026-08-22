import type { NextConfig } from "next";

// pro-site は外販前提の自己完結アプリ（@yozan/core 非依存 / スタッフ認証と無関係）。
const nextConfig: NextConfig = {
  experimental: {
    // スポンサーバナー画像のアップロード（server action経由）を通すため
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
