import { createAdmin } from "@yozan/core/supabase/admin";

// 営業デモの非公開配信。
//  - 推測不能トークンで特定（RLSはservice_role経由・トークン検証がゲート #12/#23と同型）
//  - X-Robots-Tag: noindex（HTML内のmetaと二重化）・キャッシュなし
//  - 有効期限切れは案内ページ、パスコード設定時は ?key= 照合（簡易フォーム表示）

const page = (title: string, body: string) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${title}</title>
<style>body{font-family:"Hiragino Sans","Noto Sans JP",sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f6f7f9;color:#111827}
.card{background:#fff;border:1px solid #e6e9ef;border-radius:14px;padding:40px;max-width:420px;text-align:center}
input{width:100%;padding:10px;border:1px solid #e6e9ef;border-radius:8px;margin:14px 0}
button{background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:10px 24px;font-weight:700;cursor:pointer}</style>
</head><body><div class="card">${body}</div></body></html>`;

const headers = (extra?: Record<string, string>) => ({
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "private, no-store",
  ...extra,
});

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(request.url);
  const admin = createAdmin();

  const { data: demo } = await admin
    .from("dms_demos")
    .select("html, passcode, expires_on, status")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!demo || !demo.html) {
    return new Response(page("デモが見つかりません", "<h2>ページが見つかりません</h2><p>URLをご確認ください。</p>"), {
      status: 404,
      headers: headers(),
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (demo.expires_on && demo.expires_on < today) {
    return new Response(
      page("公開期間終了", "<h2>このデモの公開期間は終了しました</h2><p>ご覧になりたい場合は、担当者までご連絡ください。</p>"),
      { status: 410, headers: headers() }
    );
  }

  if (demo.passcode) {
    const key = url.searchParams.get("key") ?? "";
    if (key !== demo.passcode) {
      return new Response(
        page(
          "閲覧コードの入力",
          `<h2>閲覧コードを入力してください</h2><p>このページは限定公開です。</p>
           <form method="get"><input name="key" type="password" placeholder="閲覧コード" autofocus><button>表示する</button></form>`
        ),
        { status: 401, headers: headers() }
      );
    }
  }

  return new Response(demo.html, { status: 200, headers: headers() });
}
