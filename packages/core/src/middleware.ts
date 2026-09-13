import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * 認証ミドルウェア生成（独立アプリ共通）。
 * 使い方（各アプリの src/middleware.ts）:
 *   import { createAuthMiddleware } from "@yozan/core/middleware";
 *   export const middleware = createAuthMiddleware({ publicPrefixes: ["/login", "/s"] });
 *   export const config = { matcher: ["..."] }; // ※Next.jsの静的解析のためmatcherはリテラル必須
 *   （AUTH_MIDDLEWARE_MATCHERをconfigに直接使うことはできない — 値のコピー元として参照）
 */
export function createAuthMiddleware(options: { publicPrefixes: string[] }) {
  return async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet: CookieToSet[]) => {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isPublic = options.publicPrefixes.some((p) => path === p || path.startsWith(`${p}/`));

    // 期限切れ・使用済みのリフレッシュトークン（refresh_token_not_found / refresh_token_already_used）は
    // Cookie が残っている限り毎リクエストで再試行され、Vercel のエラーログに同じ AuthApiError が積み上がる
    // （2026-09-13 の全チェック: lesson-os 46件・member-os 40件など）。壊れたセッション Cookie は
    // ここで捨てて、次のリクエストからは素直に未ログインとして扱う（ログインし直せば新しい Cookie が入る）。
    const staleSession = !user && !!authError && /refresh_token|session/i.test(authError.message ?? "");
    const clearStale = (res: NextResponse) => {
      if (!staleSession) return res;
      for (const c of request.cookies.getAll()) {
        if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) res.cookies.delete(c.name);
      }
      return res;
    };

    if (!user && !isPublic) {
      return clearStale(NextResponse.redirect(new URL("/login", request.url)));
    }
    if (!user && staleSession) {
      response = clearStale(response);
    }
    // ログイン済みで /login に来たらホームへ。ただし denied=1（権限なしで弾かれた）は除く —
    // 弾く側は /login?denied=1 へ飛ばすため、ここで / に戻すと無限リダイレクトになる（実障害 2026-08-11）。
    // denied のときはログイン画面を表示し、正しいアカウントで入り直してもらう。
    if (user && path === "/login" && !request.nextUrl.searchParams.has("denied")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  };
}

export const AUTH_MIDDLEWARE_MATCHER = [
  "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
];
