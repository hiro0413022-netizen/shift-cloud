import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @yozan/core はTSソースのまま提供されるため必須（#278で cash-ledger を core に移したのに入れ忘れ、以降ビルドが全部失敗していた）
  transpilePackages: ["@yozan/core"],
  // exceljs はCJS＋Node依存。バンドルさせずNode側でrequireする（/api/sales/export）
  serverExternalPackages: ["exceljs"],
  experimental: {
    serverActions: {
      // 証憑アップロード（スマホ撮影の画像/PDF）のため既定1MB→8MBへ
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
