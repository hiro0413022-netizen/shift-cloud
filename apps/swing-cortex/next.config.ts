import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/core はTSソースのまま提供されるため必須（DECISIONS #35）
  transpilePackages: ["@yozan/core"],
  experimental: {
    // Excel取込のアップロード上限（既定1MB）。WING NOTEの数千件Excelを受けるため拡張。
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
