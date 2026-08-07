import { createAuthMiddleware } from "@yozan/core/middleware";

// 公開プレフィックス:
//   /d          … 営業デモの非公開プレビュー配信（トークン検証は配信側で実施）
//   /api/track  … 閲覧計測の受信（デモ内のビーコンから叩かれる。登録漏れは #90 の事故）
//   /api/cron   … 営業先の自動ピックアップ（Vercel Cron。認証は Bearer CRON_SECRET で route 側が行う）
//   /login
export const middleware = createAuthMiddleware({ publicPrefixes: ["/login", "/d", "/api/track", "/api/cron"] });

// Next.jsの静的解析のためmatcherはリテラル必須（@yozan/coreからのimport識別子は使えない）
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
