import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/core はTSソースのまま提供されるため必須（DECISIONS #35）
  transpilePackages: ["@yozan/core"],
};

export default nextConfig;
