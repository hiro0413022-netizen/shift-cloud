import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/* はTSソースのまま提供されるため必須
  transpilePackages: ["@yozan/core", "@yozan/track"],
};

export default nextConfig;
