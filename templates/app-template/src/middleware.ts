import { createAuthMiddleware, AUTH_MIDDLEWARE_MATCHER } from "@yozan/core/middleware";

// 公開プレフィックス（ログイン不要ルート）。公開回答/受付ページ等をここに足す。
export const middleware = createAuthMiddleware({ publicPrefixes: ["/login"] });

export const config = { matcher: AUTH_MIDDLEWARE_MATCHER };
