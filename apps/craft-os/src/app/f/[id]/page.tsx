import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { FITTING_MENUS, getFitting, QUOTE_STATUS_LABELS } from "@/lib/craft";
import { dateShort, yen } from "@/lib/format";
import { Badge, btnCls, btnGhostCls, cardCls, inputCls, labelCls, SectionTitle } from "@/components/ui";
import { makeQuoteFromFitting, saveCover } from "./actions";

export const dynamic = "force-dynamic";

/**
 * 表紙。紙（01_試打シャフト表紙.xlsm の A4横）と同じ並びにしてある。
 * 違うのは3つだけ:
 *   ・お名前は受付台帳から来るので書かない
 *   ・試打NOを入れると商品名・メーカー・定価が出る
 *   ・採用にチェックを入れておけば、そのまま伝票の明細に写せる
 *
 * 表紙は伝票と別物。1枚の表紙から伝票を何件でも作れるし、作らなくてもいい。
 */
export default async function CoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const full = await getFitting(actor, Number(id));
  if (!full) notFound();
  const f = full.fitting;
  const pickedCount = full.trials.filter((t) => t.picked && t.product).length;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="no-print mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/f" className="text-xs text-(--color-dim) hover:underline">
            ← 表紙の一覧へ
          </Link>
          <h1 className="mt-1 text-xl font-bold">
            {f.customer_name} 様{" "}
            <span className="ml-2 text-sm font-normal text-(--color-dim)">{f.fitting_no}</span>
          </h1>
          <p className="mt-1 text-xs text-(--color-dim)">
            実施日 {dateShort(f.fitting_date)} ／ 担当 {f.fitter_name ?? "—"} ／ {f.member_kind}
            {f.fitting_menu ? ` ／ ${f.fitting_menu}` : ""}
            {f.fitting_minutes ? `（${f.fitting_minutes}分）` : ""}
          </p>
        </div>
        <Link href={`/print/cover/${f.id}`} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs">
          表紙を印刷
        </Link>
      </header>

      <form action={saveCover} className="space-y-6">
        <input type="hidden" name="fitting_id" value={f.id} />

        <section className={cardCls}>
          <SectionTitle>お客様とフィッティング</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={labelCls}>お客様氏名</span>
              <input name="customer_name" defaultValue={f.customer_name} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>ご連絡先</span>
              <input name="customer_contact" defaultValue={f.customer_contact ?? ""} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>実施日</span>
              <input type="date" name="fitting_date" defaultValue={f.fitting_date} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>担当フィッター</span>
              <input name="fitter_name" defaultValue={f.fitter_name ?? ""} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>会員／ビジター</span>
              <select name="member_kind" defaultValue={f.member_kind} className={inputCls}>
                <option value="会員">会員</option>
                <option value="ビジター">ビジター</option>
                <option value="スタッフ">スタッフ</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>メニュー</span>
              <select name="fitting_menu" defaultValue={f.fitting_menu ?? ""} className={inputCls}>
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
              <select name="fitting_minutes" defaultValue={f.fitting_minutes ?? ""} className={inputCls}>
                <option value="">なし</option>
                <option value="110">110分（22,000円）</option>
                <option value="55">55分（16,500円）</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={labelCls}>割引区分（伝票の掛け率が決まります）</span>
              <select name="segment" defaultValue={f.segment} className={inputCls}>
                <option value="visitor_no_fitting">フィッティング歴なし（一見のお客様）</option>
                <option value="visitor_or_intro">フィッティング歴あり／プロ紹介／再フィッティング／旧会員</option>
                <option value="member_paid_fitting">フィッティング料をお支払いの会員</option>
                <option value="from_demo_or_lesson">試打からのご購入／レッスン時のご購入</option>
              </select>
            </label>
            <label className="block sm:col-span-3">
              <span className={labelCls}>メモ（表紙に出ます）</span>
              <input name="note" defaultValue={f.note ?? ""} className={inputCls} />
            </label>
          </div>
        </section>

        <section className={cardCls}>
          <SectionTitle right={<p className="text-xs text-(--color-dim)">試打NOを入れて保存すると、商品名・メーカー・定価が出ます</p>}>
            試打したシャフト
          </SectionTitle>
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
                  <th className="w-16 py-2 text-center">採用</th>
                </tr>
              </thead>
              <tbody>
                {full.trials.map((t) => (
                  <tr key={t.id} className="border-b border-(--color-line) align-top last:border-0">
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
                    <td className="py-2 text-center">
                      <input type="checkbox" name={`picked_${t.line_no}`} defaultChecked={t.picked} disabled={!t.product} />
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

        <div className="flex flex-wrap gap-3">
          <button className={btnCls}>保存する</button>
        </div>
      </form>

      <section className={`${cardCls} mt-6`}>
        <SectionTitle>この表紙の伝票（{full.quotes.length}件）</SectionTitle>

        {full.fitting.fitting_minutes ? (
          <div className="mb-4 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3 text-xs">
            フィッティング料の返金枠 {yen(full.refund.cap)} のうち、
            <span className="font-medium"> 返金済み {yen(full.refund.used)}</span> ／ 残り{" "}
            <span className="font-medium">{yen(full.refund.remaining)}</span>
            <div className="mt-1 text-(--color-dim)">
              伝票を分けても、この表紙ぜんぶで {yen(full.refund.cap)} を超えて返金することはありません。
            </div>
          </div>
        ) : null}

        {full.quotes.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="py-2 pr-3">番号</th>
                  <th className="py-2 pr-3">日付</th>
                  <th className="py-2 pr-3">状態</th>
                  <th className="py-2 pr-3 text-right">明細</th>
                  <th className="py-2 pr-3 text-right">返金</th>
                  <th className="py-2 text-right">合計</th>
                </tr>
              </thead>
              <tbody>
                {full.quotes.map((q) => (
                  <tr key={q.id} className="border-b border-(--color-line) last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/q/${q.id}/quote`} className="font-medium text-(--color-accent) underline">
                        {q.quote_no}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-(--color-dim)">{dateShort(q.quote_date)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={q.status === "draft" ? "gray" : q.status === "void" ? "danger" : "ok"}>
                        {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-right text-(--color-dim)">{q.itemCount}行</td>
                    <td className="py-2 pr-3 text-right">{Number(q.refund_amount) > 0 ? `▲ ${yen(Number(q.refund_amount))}` : "—"}</td>
                    <td className="py-2 text-right">{q.itemCount > 0 ? yen(q.total) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <form action={makeQuoteFromFitting}>
            <input type="hidden" name="fitting_id" value={f.id} />
            <input type="hidden" name="only_picked" value="1" />
            <button className={btnCls} disabled={pickedCount === 0}>
              {pickedCount > 0 ? `採用した${pickedCount}本で伝票をつくる` : "採用にチェックを入れてください"}
            </button>
          </form>
          <form action={makeQuoteFromFitting}>
            <input type="hidden" name="fitting_id" value={f.id} />
            <input type="hidden" name="only_picked" value="0" />
            <button className={btnGhostCls}>空の伝票をつくる</button>
          </form>
        </div>
        <p className="mt-3 text-xs text-(--color-dim)">
          ドライバーは今日、アイアンは後日、のように分けるときは伝票を2枚にしてください。返金は枠を共有します。
        </p>
      </section>
    </main>
  );
}
