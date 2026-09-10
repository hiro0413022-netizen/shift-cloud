import { createAuthMiddleware } from "@yozan/core/middleware";

// /cast はキャスト用スマホ（Supabase Authではなく nite_cast_sessions で認証）なので、
// スタッフ用のログイン判定からは外す。中身の保護は requireCast() が行う。
export const middleware = createAuthMiddleware({ publicPrefixes: ["/login", "/cast", "/api/cast-logout"] });

// Next.jsの静的解析のためmatcherはリテラル必須（@yozan/coreからのimport識別子は使えない）
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
