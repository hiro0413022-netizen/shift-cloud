import { NextRequest, NextResponse } from "next/server";
import { createJoinCheckoutForMember } from "@/lib/frank-square-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * FRANK GOLF Web入会（即決済・#129）: 申込直後の会員行に対する決済リンク発行。
 * POST {member_id, redirect_url}
 *
 * member-os の /join-web（server action）からサーバー間で呼ぶ。
 * member_id は申込時に発行される UUID（推測不能）で、これが実質の認可。
 * できることは「その会員自身のプランの決済リンクを作る」だけ＝悪用の実益がない。
 * Square env は yozan-genesis にのみ設定されているため、決済リンク作成はこちら側で行う。
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const memberId = String(body.member_id ?? "");
  const redirectUrl = String(body.redirect_url ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) {
    return NextResponse.json({ ok: false, error: "bad_member_id" }, { status: 400 });
  }
  // 完了画面は member-os / frankgolf.jp のみ許可（open redirect 防止）
  const okRedirect =
    redirectUrl.startsWith("https://member-os-tau.vercel.app/") || redirectUrl.startsWith("https://frankgolf.jp/");
  if (!okRedirect) return NextResponse.json({ ok: false, error: "bad_redirect" }, { status: 400 });

  const r = await createJoinCheckoutForMember(memberId, redirectUrl);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
