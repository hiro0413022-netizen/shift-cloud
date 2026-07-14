import { createAuthMiddleware } from "@yozan/core/middleware";

// 公開プレフィックス: /d（営業デモの非公開プレビュー配信・トークン検証は配信側で実施）, /login
export const middleware = createAuthMiddleware({ publicPrefixes: ["/login", "/d"] });

// Next.jsの静的解析のためmatcherはリテラル必須（@yozan/coreからのimport識別子は使えない）
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
