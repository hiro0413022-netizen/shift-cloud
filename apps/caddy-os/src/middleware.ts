import { createAuthMiddleware } from "@yozan/core/middleware";

// 公開プレフィックス（ログイン不要ルート）。実装は @yozan/core（DECISIONS #35）
// /s = キャディ本人のシフト希望提出（トークンで本人を特定 / migration 0118）
// /api/v1 = 外部連携API（Bearerトークンをルート側で照合する。ここでログインへ飛ばすと401が返せない）
export const middleware = createAuthMiddleware({
  publicPrefixes: ["/login", "/manual", "/s", "/api/v1"],
});

// Next.jsの静的解析のためmatcherはリテラル必須（@yozan/coreからのimport識別子は使えない）
// ※ _next/static を除外しないと、ログインページのJS/CSSまで認証チェックで307にされ、
//   画面が固まって「ログインできない」状態になる（2026-07-11 に実際に踏んだ事故）
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
