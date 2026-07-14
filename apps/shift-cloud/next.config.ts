import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/core はTSソースのまま提供されるため必須（ask-data等）
  transpilePackages: ["@yozan/core"],
};

export default nextConfig;
