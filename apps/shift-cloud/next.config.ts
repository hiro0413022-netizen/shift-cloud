import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/core はTSソースのまま提供されるため必須（ask-data等）
  transpilePackages: ["@yozan/core"],
  // 給与明細PDF（出勤簿つき）の日本語フォント。fsで読むためトレースに含める（genesis #129 と同じ方式）
  outputFileTracingIncludes: {
    "/admin/payroll/pdf": ["./src/assets/**"],
  },
};

export default nextConfig;
