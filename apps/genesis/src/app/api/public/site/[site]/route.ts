import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";
import { publicCoaches, type CoachRow } from "@yozan/core/frank-coach-profile";

export const dynamic = "force-dynamic";

/**
 * サイトCMS 公開API（#85 FRANK §3-1）
 * GET /api/public/site/frank-golf → { data: {...FRANKオーバーライド}, news: [...], coaches: [...] }
 * 静的サイト（frankgolf.jp）の assets/cms.js が読み込み、window.FRANK に deep-merge する。
 * 認証なし・読み取り専用・キャッシュ60秒。
 *
 * ★ coaches（#279・2026-09-25）
 *   コーチ紹介は会員ページと公式サイトで同じ行（frunk_coaches）を読む。ここで返して
 *   assets/site.js が描く＝店舗スタッフが管理画面で直したら、デプロイなしで公式サイトが変わる。
 *   **名前を出さないスタッフ（staff.line_hidden・#243）に紐づく行は、ここでも必ず落とす。**
 */
const ALLOWED_SITES = new Set(["frank-golf"]);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ site: string }> }) {
  const { site } = await ctx.params;
  if (!ALLOWED_SITES.has(site)) {
    return NextResponse.json({ error: "unknown site" }, { status: 404 });
  }
  const admin = createAdmin();
  const [{ data }, coaches] = await Promise.all([
    admin.from("gn_site_content").select("data, news, updated_at").eq("site", site).maybeSingle(),
    loadCoaches(),
  ]);
  return NextResponse.json(
    { data: data?.data ?? {}, news: data?.news ?? [], coaches, updated_at: data?.updated_at ?? null },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

/** 公式サイトに出すコーチ。下書き・掲載停止・「名前を出さない」スタッフは返さない */
async function loadCoaches() {
  const admin = createAdmin();
  const [rows, hidden] = await Promise.all([
    admin
      .from("frunk_coaches")
      .select("id, name, name_en, title, photo_url, bio, quals, sort_order, published, staff_id, link_url, link_label")
      .eq("store_id", FRANK_STORE_ID)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    admin.from("staff").select("id").eq("line_hidden", true).is("deleted_at", null),
  ]);
  const hiddenIds = ((hidden.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  return publicCoaches((rows.data ?? []) as CoachRow[], hiddenIds);
}
