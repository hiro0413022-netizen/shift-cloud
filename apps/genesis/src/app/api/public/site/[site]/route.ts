import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * サイトCMS 公開API（#85 FRANK §3-1）
 * GET /api/public/site/frank-golf → { data: {...FRANKオーバーライド}, news: [...] }
 * 静的サイト（frankgolf.jp）の assets/cms.js が読み込み、window.FRANK に deep-merge する。
 * 認証なし・読み取り専用・キャッシュ60秒。
 */
const ALLOWED_SITES = new Set(["frank-golf"]);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ site: string }> }) {
  const { site } = await ctx.params;
  if (!ALLOWED_SITES.has(site)) {
    return NextResponse.json({ error: "unknown site" }, { status: 404 });
  }
  const admin = createAdmin();
  const { data } = await admin.from("gn_site_content").select("data, news, updated_at").eq("site", site).maybeSingle();
  return NextResponse.json(
    { data: data?.data ?? {}, news: data?.news ?? [], updated_at: data?.updated_at ?? null },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
