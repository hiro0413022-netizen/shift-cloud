import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/core はTSソースのまま提供されるため必須（DECISIONS #35）
  transpilePackages: ["@yozan/core"],
  experimental: {
    // 骨格データ（1本あたり最大約400KB）をサーバーアクションで送るため既定1MBから引き上げる
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
