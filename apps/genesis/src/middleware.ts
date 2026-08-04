import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * ログイン不要のパス。
 * /api/cron は Vercel Cron（毎朝6時JST）が Bearer CRON_SECRET で叩く。
 * ここに入れ忘れていたため、cronの呼び出しが /login へ307リダイレクトされ、
 * 日次レポートが「手動で押した日しか出ない」状態になっていた（2026-07-14 発見・DECISIONS #52）。
 * 認証はルート側の CRON_SECRET チェックで担保する（middlewareを通さないだけ）。
 */
// /api/public は認証不要の公開API群（FRANKサイトのCMS/打席予約/レッスン予約 #85〜#88）。
// 入れ忘れると全APIが/loginへ307し、サイト側は「読み込みに失敗」になる（#90でE2Eテストにより発見）。
// /lp は集客LP（PGA NOTE / SWING CORTEX #101）、/api/track は閲覧計測ビーコン（@yozan/track・#90の教訓）。
const PUBLIC_PREFIXES = ["/login", "/api/webhooks", "/api/cron", "/api/public", "/api/track", "/manual", "/lp"];

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
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
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
