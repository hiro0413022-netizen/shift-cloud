import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";

export const dynamic = "force-dynamic";

// 現サイト vs デモの比較画面（営業でそのまま見せる）。
// 注意: 現サイト側は X-Frame-Options 等でiframe拒否の場合があるため、別タブリンクを常設。
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const actor = await requireActor();
  const admin = createAdmin();

  const { data: p } = await admin.from("dms_prospects").select("*").eq("id", id).eq("company_id", actor.companyId).single();
  if (!p) notFound();
  const { data: demo } = await admin
    .from("dms_demos")
    .select("token")
    .eq("prospect_id", id)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sp = view === "sp";
  const frameCls = sp
    ? "mx-auto h-[640px] w-[375px] rounded-3xl border-8 border-gray-800 bg-white"
    : "h-[640px] w-full rounded-lg border border-(--color-line) bg-white";

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/p/${id}`} className="text-xs text-(--color-dim) hover:text-(--color-txt)">← {p.name} 詳細へ戻る</Link>
          <h1 className="text-xl font-bold">現サイト と 改善案デモ の比較 — {p.name}</h1>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href={`/p/${id}/compare`} className={`rounded-lg px-4 py-2 ${!sp ? "bg-(--color-accent) text-white" : "border border-(--color-line)"}`}>PC表示</Link>
          <Link href={`/p/${id}/compare?view=sp`} className={`rounded-lg px-4 py-2 ${sp ? "bg-(--color-accent) text-white" : "border border-(--color-line)"}`}>スマートフォン表示</Link>
        </div>
      </header>

      <p className="mb-4 rounded-lg bg-(--color-panel-2) p-3 text-xs text-(--color-dim)">
        見せ方（訪問トークの順番）: ①現サイトの<b>良い点</b>から伝える → ②少し分かりにくい点を共有 → ③デモで改善後を見せる →
        ④{p.industry === "vet" ? "飼い主さま" : "患者さま"}のメリット・医院運営のメリットを説明。
        「悪い・古い」という言葉は使わない。
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cardCls}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">現在のホームページ</h2>
            {p.website_url && <a href={p.website_url} target="_blank" className="text-xs text-(--color-accent) hover:underline">別タブで開く ↗</a>}
          </div>
          {p.website_url ? (
            <>
              <iframe src={p.website_url} className={frameCls} />
              <p className="mt-2 text-xs text-(--color-dim)">※表示されない場合（埋め込み拒否のサイト）は「別タブで開く」を使用</p>
            </>
          ) : (
            <p className="text-sm text-(--color-dim)">ホームページURL未登録</p>
          )}
        </section>

        <section className={`${cardCls} border-(--color-ok)`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-(--color-ok)">改善案デモ</h2>
            {demo && <a href={`/d/${demo.token}`} target="_blank" className="text-xs text-(--color-accent) hover:underline">別タブで開く ↗</a>}
          </div>
          {demo ? <iframe src={`/d/${demo.token}`} className={frameCls} /> : <p className="text-sm text-(--color-dim)">デモ未生成（詳細ページで生成してください）</p>}
        </section>
      </div>

      <section className={`${cardCls} mt-6`}>
        <h2 className="mb-2 font-semibold">比較のポイント（面談用メモ）</h2>
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <h3 className="font-medium text-(--color-ok)">現在の良い点</h3>
            <p className="whitespace-pre-wrap text-(--color-dim)">{p.good_points ?? "（分析欄に入力すると表示されます）"}</p>
          </div>
          <div>
            <h3 className="font-medium text-(--color-warn)">現在少し分かりにくい点</h3>
            <p className="whitespace-pre-wrap text-(--color-dim)">{p.improve_points ?? "（分析欄に入力すると表示されます）"}</p>
          </div>
          <div>
            <h3 className="font-medium">新しい案で改善した点</h3>
            <p className="text-(--color-dim)">ファーストビューで診療時間・電話へ即到達 / スマホ下部の固定バー（電話・予約・アクセス）/ 初診案内の明確化 / お知らせ・採用の入口</p>
          </div>
          <div>
            <h3 className="font-medium">メリット</h3>
            <p className="text-(--color-dim)">{p.industry === "vet" ? "飼い主" : "患者"}さま: 迷わず予約・来院できる ／ 医院運営: 電話問い合わせの質向上・更新が簡単・採用の受け皿</p>
          </div>
        </div>
      </section>
    </main>
  );
}
