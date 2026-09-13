import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { FITTING_MENUS, getQuote } from "@/lib/craft";
import { yen } from "@/lib/format";
import { btnCls, btnGhostCls, cardCls, inputCls, labelCls } from "@/components/ui";
import { QuoteNav } from "@/components/nav";
import { adoptTrial, saveCover } from "./actions";

export const dynamic = "force-dynamic";

/**
 * フィッティング表紙。紙（01_試打シャフト表紙.xlsm の A4横）と同じ並びにしてある。
 * 違うのは2つだけ:
 *   ・お名前は受付台帳から来るので書かない
 *   ・試打NOを入れると商品名・メーカー・定価が出て、そのまま【見積に入れる】が押せる
 */
export default async function CoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const full = await getQuote(actor, Number(id));
  if (!full) notFound();
  const q = full.quote;

  return (
    <>
      <QuoteNav id={id} active="" />

      <form action={saveCover} className="space-y-6">
        <input type="hidden" name="quote_id" value={q.id} />

        <section className={cardCls}>
          <h2 className="mb-4 text-sm font-bold">お客様とフィッティング</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={labelCls}>お客様氏名</span>
              <input name="customer_name" defaultValue={q.customer_name} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>ご連絡先</span>
              <input name="customer_contact" defaultValue={q.customer_contact ?? ""} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>実施日</span>
              <input type="date" name="fitting_date" defaultValue={q.fitting_date ?? ""} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>担当フィッター</span>
              <input name="fitter_name" defaultValue={q.fitter_name ?? ""} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>会員／ビジター</span>
              <select name="member_kind" defaultValue={q.member_kind} className={inputCls}>
                <option value="会員">会員</option>
                <option value="ビジター">ビジター</option>
                <option value="スタッフ">スタッフ</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>メニュー</span>
              <select name="fitting_menu" defaultValue={q.fitting_menu ?? ""} className={inputCls}>
                <option value="">（選択）</option>
                {FITTING_MENUS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>フィッティング料</span>
              <select name="fitting_minutes" defaultValue={q.fitting_minutes ?? ""} className={inputCls}>
                <option value="">なし</option>
                <option value="110">110分（22,000円）</option>
                <option value="55">55分（16,500円）</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={labelCls}>割引区分（見積の掛け率が決まります）</span>
              <select name="segment" defaultValue={q.segment} className={inputCls}>
                <option value="visitor_no_fitting">フィッティング歴なし（一見のお客様）</option>
                <option value="visitor_or_intro">フィッティング歴あり／プロ紹介／再フィッティング／旧会員</option>
                <option value="member_paid_fitting">フィッティング料をお支払いの会員</option>
                <option value="from_demo_or_lesson">試打からのご購入／レッスン時のご購入</option>
              </select>
            </label>
          </div>
        </section>

        <section className={cardCls}>
          <div className="mb-4 flex items-center justify-between border-b border-(--color-line) pb-3">
            <h2 className="text-sm font-bold">試打したシャフト</h2>
            <p className="text-xs text-(--color-dim)">試打NOを入れて保存すると、商品名・メーカー・定価が出ます</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="w-10 py-2">#</th>
                  <th className="w-24 py-2 pr-2">試打NO</th>
                  <th className="py-2 pr-2">シャフト名</th>
                  <th className="w-40 py-2 pr-2">メーカー</th>
                  <th className="w-24 py-2 pr-2 text-right">定価</th>
                  <th className="w-16 py-2 pr-2">棚</th>
                  <th className="w-36 py-2 pr-2">ヘッド</th>
                  <th className="py-2 pr-2">memo</th>
                  <th className="w-28 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {full.trials.map((t) => (
                  <tr key={t.id} className="border-b border-(--color-line) last:border-0 align-top">
                    <td className="py-2 text-(--color-dim)">{t.line_no}</td>
                    <td className="py-2 pr-2">
                      <input
                        name={`demo_${t.line_no}`}
                        defaultValue={t.demo_no ?? ""}
                        inputMode="numeric"
                        className={`${inputCls} px-2 py-1`}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      {t.product ? (
                        <span>
                          {t.product.name}
                          {t.product.spec ? ` ${t.product.spec}` : ""}
                          {t.product.club_type ? (
                            <span className="ml-1 text-xs text-(--color-dim)">{t.product.club_type}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-xs text-(--color-dim)">{t.demoNote ?? "—"}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-(--color-dim)">{t.product?.manufacturer ?? "—"}</td>
                    <td className="py-2 pr-2 text-right">{t.product ? yen(t.product.list_price) : "—"}</td>
                    <td className="py-2 pr-2 text-xs text-(--color-dim)">{t.shelf ?? "—"}</td>
                    <td className="py-2 pr-2">
                      <input name={`head_${t.line_no}`} defaultValue={t.head_name ?? ""} className={`${inputCls} px-2 py-1`} />
                    </td>
                    <td className="py-2 pr-2">
                      <input name={`memo_${t.line_no}`} defaultValue={t.memo ?? ""} className={`${inputCls} px-2 py-1`} />
                    </td>
                    <td className="py-2">
                      {t.product ? (
                        <button
                          formAction={adoptTrial}
                          name="trial_id"
                          value={t.id}
                          className="rounded-lg border border-(--color-line) px-2 py-1 text-xs hover:bg-(--color-panel-2)"
                        >
                          {t.picked ? "もう一度入れる" : "見積に入れる"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-(--color-dim)">
            定価は商品マスタ（発注管理）から出しています。この表紙は定価を持たないので、値上げがあっても直す必要はありません。
          </p>
        </section>

        <div className="flex gap-3">
          <button className={btnCls}>保存する</button>
          <a href={`/q/${id}/quote`} className={btnGhostCls}>
            見積へ進む
          </a>
        </div>
      </form>
    </>
  );
}
