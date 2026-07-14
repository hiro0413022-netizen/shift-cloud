import { createAuthMiddleware } from "@yozan/core/middleware";

// 公開プレフィックス: /reserve（公開予約）, /login。実装は @yozan/core（DECISIONS #35）
export const middleware = createAuthMiddleware({ publicPrefixes: ["/login", "/reserve"] });

// Next.jsの静的解析のためmatcherはリテラル必須（@yozan/coreからのimport識別子は使えない）
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
