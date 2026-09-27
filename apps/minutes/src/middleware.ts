import { createAuthMiddleware } from "@yozan/core/middleware";

// 公開プレフィックス（ログイン不要ルート）。公開回答/受付ページ等をここに足す。
export const middleware = createAuthMiddleware({ publicPrefixes: ["/login"] });

// Next.jsの静的解析のためmatcherはリテラル必須（@yozan/coreからのimport識別子は使えない）
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
