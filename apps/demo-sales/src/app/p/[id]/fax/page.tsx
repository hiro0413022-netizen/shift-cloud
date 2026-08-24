import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { qrSvg } from "@/lib/qr";

export const dynamic = "force-dynamic";

// FAX送付状（A4・1枚・QRコード付き）— メール未登録の営業先にデモURLをFAXで届けるための紙。
// 見積書（/q/[id]）と同じ方式: ブラウザの「印刷 → PDFとして保存」でPDF化。印刷してそのままFAXでも可。
// FAXは白黒・低解像度で劣化するため: グレー背景を使わない／文字は大きめ／QRは約50mm・誤り訂正M。

export default async function FaxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const admin = createAdmin();

  const { data: p } = await admin
    .from("dms_prospects")
    .select("*")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .single();
  if (!p) notFound();

  const [{ data: demo }, { data: st }] = await Promise.all([
    admin
      .from("dms_demos")
      .select("token, passcode, expires_on")
      .eq("prospect_id", id)
      .is("deleted_at", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("dms_quote_settings").select("*").eq("company_id", actor.companyId).maybeSingle(),
  ]);

  const siteBase = process.env.NEXT_PUBLIC_SITE_URL ?? "https://demo-sales-delta.vercel.app";
  const demoUrl = demo ? `${siteBase}/d/${demo.token}` : null;
  const owner = p.owner_name ?? actor.name;
  const today = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const build = (p.est_build_price ?? 100000).toLocaleString();
  const monthly = (p.est_monthly_fee ?? 10000).toLocaleString();

  return (
    <main className="mx-auto max-w-[820px] p-6 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/p/${id}`} className="text-xs text-(--color-dim) hover:text-(--color-txt)">
          ← 営業先へ戻る
        </Link>
        <p className="text-xs text-(--color-dim)">
          印刷（Ctrl/⌘+P）してそのままFAXへ。「PDFとして保存」を選べばネットFAXに添付できます。
        </p>
      </div>
      {!demoUrl && (
        <p className="mb-4 rounded-lg border border-(--color-danger) p-3 text-sm text-(--color-danger) print:hidden">
          デモが未作成のため、QRコードを載せられません。先に営業先ページで「デモを生成する」を実行してから開き直してください。
        </p>
      )}

      <div className="rounded-xl border border-(--color-line) bg-white p-10 text-[13px] leading-relaxed text-black shadow-sm print:rounded-none print:border-0 print:shadow-none">
        {/* ヘッダー */}
        <div className="flex items-end justify-between border-b-2 border-black pb-2 text-xs">
          <span className="font-bold tracking-widest">FAX送付のご案内（本紙を含め 1 枚）</span>
          <span>{today}</span>
        </div>

        {/* 宛先・差出 */}
        <div className="mt-5 flex items-start justify-between gap-6">
          <div>
            <p className="border-b border-black pb-1 text-lg font-bold">{p.name} 御中</p>
            {p.contact_name && <p className="mt-1 text-sm">{p.contact_name} 様</p>}
          </div>
          <div className="text-right text-xs">
            <p className="text-base font-bold">{st?.issuer_name ?? "株式会社YOZAN"}</p>
            {st?.issuer_address && <p>{st.issuer_address}</p>}
            {st?.issuer_tel && <p>TEL: {st.issuer_tel}</p>}
            {st?.issuer_email && <p>{st.issuer_email}</p>}
            <p className="mt-1">担当: {owner}</p>
          </div>
        </div>

        {/* 表題 */}
        <h1 className="my-6 text-center text-xl font-bold leading-snug">
          {p.name}さま専用の
          <br />
          ホームページ画面案を作成いたしました
        </h1>

        {/* 本文（電話前メールC4と同じ型・FAX向けに短く） */}
        <p className="text-sm">
          突然のご案内、失礼いたします。株式会社YOZAN（兵庫県／ゴルフスクール運営）の{owner}と申します。
          私どもは自社店舗の予約・会員管理システムを開発しており、その技術を活かしてホームページ制作を行っております。
          このたび勝手ながら、{p.name}さま向けのホームページの画面案を作成いたしました。
          売り込みではなく、<b>実際の画面をご覧いただき、要る・要らないをご判断いただくだけ</b>のご案内です。
        </p>

        {/* QRコード */}
        <div className="my-6 flex items-center justify-between gap-8 border-2 border-black p-5">
          <div className="text-sm">
            <p className="text-base font-bold">スマートフォンのカメラをかざすと、実際の画面がご覧いただけます</p>
            <p className="mt-2">
              ① スマートフォンのカメラを右のQRコードに向ける
              <br />② 画面に表示されるリンクをタップ
              <br />
              （{demo?.expires_on ? `${demo.expires_on} まで` : "60日間"}ご覧いただけます・検索には載らない非公開ページです）
            </p>
            {demo?.passcode && <p className="mt-2 text-base font-bold">閲覧パスコード: {demo.passcode}</p>}
            {demoUrl && <p className="mt-2 break-all text-xs">URLを直接入力される場合: {demoUrl}</p>}
          </div>
          {demoUrl ? (
            <div style={{ width: "50mm" }} className="shrink-0 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg(demoUrl) }} />
          ) : (
            <div style={{ width: "50mm", height: "50mm" }} className="flex shrink-0 items-center justify-center border border-dashed border-black text-center text-xs">
              QRコードは
              <br />
              デモ生成後に入ります
            </div>
          )}
        </div>

        {/* 料金 */}
        <table className="mx-auto border-collapse text-sm">
          <tbody>
            <tr>
              <td className="border border-black px-4 py-2">制作費</td>
              <td className="border border-black px-4 py-2 text-right font-bold">{build}円（税抜）</td>
              <td className="border border-black px-4 py-2">月額</td>
              <td className="border border-black px-4 py-2 text-right font-bold">{monthly}円（税抜）</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-center text-xs">
          月額にはサーバー・ドメイン管理・文章や写真の差し替え・お知らせの更新作業がすべて含まれます（お電話1本で対応します）。
        </p>

        {/* 結び */}
        <p className="mt-6 text-sm">
          本画面案の作成にあたり、{p.name}さまの写真・ロゴ・文章は一切使用しておりません（すべて仮の素材です）。
          ご不要の場合は、本紙をそのまま破棄していただいて構いません。ご興味をお持ちいただけましたら、
          {st?.issuer_tel ? `お電話（${st.issuer_tel}・担当: ${owner}）` : `担当 ${owner} まで`}
          にてご連絡ください。10分ほどでご説明いたします。
        </p>
      </div>
    </main>
  );
}
