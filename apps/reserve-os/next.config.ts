import type { NextConfig } from "next";

/** #307: 公開フォーム（/reserve/<slug>）は member-os へ移設。旧 URL は 308 で転送する。
 *  移設先の member-os に RESERVE_STAFF_EMAIL / RESERVE_FROM_EMAIL / RESEND_API_KEY / NEXT_PUBLIC_LIFF_ID を設定してから、
 *  RESERVE_FORM_REDIRECT=on にする（未設定の間は旧フォームがそのまま動く＝安全側）。 */
const FORM_HOME = process.env.RESERVE_FORM_HOME || "https://member-os-tau.vercel.app";

const nextConfig: NextConfig = {
  // @yozan/core はTSソースのまま提供されるため必須（DECISIONS #35）
  transpilePackages: ["@yozan/core"],
  async redirects() {
    if (process.env.RESERVE_FORM_REDIRECT !== "on") return [];
    return [{ source: "/reserve/:slug", destination: `${FORM_HOME}/reserve/:slug`, permanent: true }];
  },
};

export default nextConfig;
