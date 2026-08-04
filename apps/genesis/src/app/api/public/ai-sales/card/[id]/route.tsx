import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * Instagram投稿用カード画像（1080×1080 PNG・#101）。
 * Instagramのフィード投稿は画像必須のため、投稿のhook（見出し）をブランドカード化して配信する。
 * Meta側がこのURLを取得しに来るため公開（/api/public 配下）。IDはUUID＝推測不可。
 *
 * 日本語フォント: Google Fonts の css2 に text= を渡してサブセットTTFを実行時取得
 * （リポジトリにフォントバイナリを置かない）。取得失敗時もレイアウトは崩さず描画する。
 */
export const dynamic = "force-dynamic";

const BRAND: Record<string, { label: string; sub: string; from: string; to: string; accent: string }> = {
  pganote: { label: "PGA NOTE", sub: "レッスンを、記録から強くする", from: "#0b2e1f", to: "#123f2c", accent: "#7be3a6" },
  "swing-cortex": { label: "SWING CORTEX", sub: "コーチの目に、根拠を。", from: "#062b2e", to: "#0b3d42", accent: "#5eead4" },
  webdesign: { label: "YOZAN WEB制作", sub: "完成形を見てから、決められる。", from: "#0d1b2e", to: "#14263f", accent: "#7ab8f5" },
};

async function loadJpFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`,
      // 古いUAを名乗るとwoff2ではなくTTFのURLが返る（satoriはwoff2非対応）
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" }, signal: AbortSignal.timeout(8000) }
    ).then((r) => r.text());
    const m = css.match(/src:\s*url\((https:[^)]+)\)\s*format\('(?:truetype|opentype)'\)/);
    if (!m) return null;
    return await fetch(m[1], { signal: AbortSignal.timeout(8000) }).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin = createAdmin();
  const { data: post } = await admin
    .from("cnt_posts")
    .select("id, product, hook, theme")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!post) return new Response("not found", { status: 404 });

  const brand = BRAND[String(post.product)] ?? BRAND.pganote;
  const hook = String(post.hook ?? "").slice(0, 40);
  const fontText = `${hook}${brand.label}${brand.sub}ゴルフコーチお店・クリニックのための詳しくはプロフィールのリンクへ`;
  const font = await loadJpFont(fontText);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: `linear-gradient(135deg, ${brand.from}, ${brand.to})`,
          color: "#f4f6f5",
          fontFamily: font ? "NotoJP" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: brand.accent, display: "flex" }} />
          <div style={{ fontSize: 40, letterSpacing: 6, color: brand.accent, display: "flex" }}>{brand.label}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 34, color: "#9fb5ac", display: "flex" }}>
            {String(post.product) === "webdesign" ? "お店・クリニックのための" : "ゴルフコーチのための"}
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.35, display: "flex" }}>{hook}</div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `2px solid ${brand.accent}44`,
            paddingTop: 36,
          }}
        >
          <div style={{ fontSize: 32, color: "#c8d6d0", display: "flex" }}>{brand.sub}</div>
          <div style={{ fontSize: 28, color: "#9fb5ac", display: "flex" }}>詳しくはプロフィールのリンクへ →</div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: font ? [{ name: "NotoJP", data: font, weight: 700 as const, style: "normal" as const }] : [],
      headers: { "Cache-Control": "public, s-maxage=86400" },
    }
  );
}
