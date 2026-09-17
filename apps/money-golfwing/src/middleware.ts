import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/manual"];

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
    error: authError,
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  // 使えなくなったログイン（refresh_token_not_found 等）の Cookie は捨てる。
  // 残しておくと毎回同じエラーになり、ログインし直すまで直らない（@yozan/core/middleware と同じ処理）
  const authCode = (authError as { code?: string } | null)?.code ?? "";
  const staleSession =
    !user && !!authError && (/refresh[ _]?token/i.test(authCode) || /refresh[ _]?token|session/i.test(authError.message ?? ""));
  const clearStale = (res: NextResponse) => {
    if (!staleSession) return res;
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) res.cookies.delete(c.name);
    }
    return res;
  };

  if (!user && !isPublic) {
    // 保存ボタン（Server Action）の途中でログインが切れた場合は、ログイン画面のHTMLを返さない。
    // HTMLを返すと画面が「Application error」の白い画面になり、入力中の内容が見えなくなる。
    // 401 を返せば、画面側で「保存できませんでした」と出して入力を残せる（SalesEntry）
    if (request.method === "POST" && request.headers.has("next-action")) {
      return clearStale(new NextResponse("ログインが切れています。ログインし直してください。", { status: 401 }));
    }
    return clearStale(NextResponse.redirect(new URL("/login", request.url)));
  }
  if (!user && staleSession) {
    response = clearStale(response);
  }
  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
