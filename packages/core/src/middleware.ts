import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * 認証ミドルウェア生成（独立アプリ共通）。
 * 使い方（各アプリの src/middleware.ts）:
 *   import { createAuthMiddleware, AUTH_MIDDLEWARE_MATCHER } from "@yozan/core/middleware";
 *   export const middleware = createAuthMiddleware({ publicPrefixes: ["/login", "/s"] });
 *   export const config = { matcher: AUTH_MIDDLEWARE_MATCHER };
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
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isPublic = options.publicPrefixes.some((p) => path === p || path.startsWith(`${p}/`));

    if (!user && !isPublic) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (user && path === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  };
}

export const AUTH_MIDDLEWARE_MATCHER = [
  "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
];
