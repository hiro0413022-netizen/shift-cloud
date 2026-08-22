import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/core はTSソースのまま提供されるため必須
  transpilePackages: ["@yozan/core"],
  // ゴルフ場提出PDFの日本語フォント。fsで読むためトレースに含める（#129 / 給与明細PDFと同じ方式）
  outputFileTracingIncludes: {
    "/exports/pdf": ["./src/assets/**"],
  },
};

export default nextConfig;
