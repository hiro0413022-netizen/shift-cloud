import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/* はTSソースのまま提供されるため必須
  transpilePackages: ["@yozan/core", "@yozan/track", "@yozan/prospect", "@yozan/outreach", "@yozan/genesis-core"],
};

export default nextConfig;
