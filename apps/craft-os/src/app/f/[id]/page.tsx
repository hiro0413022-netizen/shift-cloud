import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { FITTING_MENUS, getFitting, QUOTE_STATUS_LABELS } from "@/lib/craft";
import { dateShort, yen } from "@/lib/format";
import { CoverPaper, MENU_LABELS, Money } from "@/components/paper";
import { DemoNoInput } from "@/components/demo-no-input";
import { PrintButtons } from "@/components/print-frame";
import { Badge, btnCls, btnGhostCls, cardCls, inputCls, labelCls, SectionTitle } from "@/components/ui";
import { makeQuoteFromFitting, saveCover } from "./actions";

export const dynamic = "force-dynamic";

/** 紙の上の入力欄（点線。印刷には出ない） */
const PIN =
  "w-full rounded-sm border border-dashed border-transparent bg-transparent px-0.5 outline-none hover:border-sky-400 focus:border-sky-600 focus:bg-sky-50";

/**
 * 表紙。紙（01_試打シャフト表紙.xlsm の A4横＝Fitting Report）そのものの上で直す（2026-09-18〜・印刷と同じ部品）。
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
            {f.guest_id ? (
              <Link href={`/k/${f.guest_id}`} className="hover:underline">
                {f.customer_name} 様
              </Link>
            ) : (
              <>{f.customer_name} 様</>
            )}{" "}
            <span className="ml-2 text-sm font-normal text-(--color-dim)">{f.fitting_no}</span>
          </h1>
          <p className="mt-1 text-xs text-(--color-dim)">
            実施日 {dateShort(f.fitting_date)} ／ 担当 {f.fitter_name ?? "—"} ／ {f.member_kind}
            {f.fitting_menu ? ` ／ ${f.fitting_menu}` : ""}
            {f.fitting_minutes ? `（${f.fitting_minutes}分）` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {f.guest_id && (
            <Link href={`/k/${f.guest_id}`} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs">
              お客様カルテ
            </Link>
          )}
          <Link href={`/print/cover/${f.id}`} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs">
            表紙を印刷
          </Link>
        </div>
      </header>

      <form action={saveCover} className="space-y-4">
        <input type="hidden" name="fitting_id" value={f.id} />
        {/* Enter で送ったときは「保存」だけ（先頭の送信ボタンが既定になるので、印刷ボタンより前に置く） */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          保存
        </button>

        {/* Fitting Report そのもの（印刷と同じ紙・A4横）。点線の欄はここで直して【保存】 */}
        <div className="overflow-x-auto rounded-xl border border-(--color-line) bg-(--color-panel-2) p-3 sm:p-6">
          <div className="mx-auto mb-3 min-w-[980px] max-w-[297mm]">
            <PrintButtons items={[{ doc: "cover", label: "表紙を印刷", primary: true }]} />
          </div>
          <div className="mx-auto min-w-[980px] max-w-[297mm] bg-white p-6 text-black shadow-md">
            <CoverPaper
              customer={<input name="customer_name" defaultValue={f.customer_name} className={`${PIN} text-center font-bold`} />}
              date={<input type="date" name="fitting_date" defaultValue={f.fitting_date} className={`${PIN} text-right`} />}
              fitter={<input name="fitter_name" defaultValue={f.fitter_name ?? ""} className={PIN} />}
              kindPicker={
                <>
                  {(["会員", "ビジター"] as const).map((k) => (
                    <label key={k} className="inline-flex cursor-pointer items-center gap-2">
                      <input type="radio" name="member_kind" value={k} defaultChecked={f.member_kind === k} className="h-3 w-3" />
                      {k}
                    </label>
                  ))}
                  <label className="no-print inline-flex cursor-pointer items-center gap-2 text-gray-500">
                    <input type="radio" name="member_kind" value="スタッフ" defaultChecked={f.member_kind === "スタッフ"} className="h-3 w-3" />
                    スタッフ
                  </label>
                </>
              }
              menuPicker={FITTING_MENUS.map((m) => (
                <label key={m} className="inline-flex cursor-pointer items-center gap-2">
                  <input type="radio" name="fitting_menu" value={m} defaultChecked={f.fitting_menu === m} className="h-3 w-3" />
                  {MENU_LABELS[m]}
                </label>
              ))}
              rows={full.trials.map((t) => ({
                key: t.id,
                lineNo: t.line_no,
                lead: (
                  <input
                    type="checkbox"
                    name={`picked_${t.line_no}`}
                    defaultChecked={t.picked}
                    disabled={!t.product}
                    title="採用（伝票に写す）"
                    className="no-print h-3 w-3"
                  />
                ),
                demoNo: <DemoNoInput fittingId={f.id} lineNo={t.line_no} defaultValue={t.demo_no} />,
                name: (
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium" title={t.shelf ? `棚 ${t.shelf}` : undefined}>
                      {t.product ? (
                        <>
                          {t.product.name}
                          {t.product.spec ? ` ${t.product.spec}` : ""}
                          {t.product.club_type ? <span className="ml-1 text-[8pt] text-gray-500">{t.product.club_type}</span> : null}
                        </>
                      ) : (
                        <span className="text-[8pt] text-gray-400">{t.demoNote ?? ""}</span>
                      )}
                    </span>
                    {/* ヘッドは紙に無い欄。シャフトが入った行だけ出す（空行に「ヘッド」が並ぶと紙が読みにくい） */}
                    {t.product || t.head_name ? (
                      <input
                        name={`head_${t.line_no}`}
                        defaultValue={t.head_name ?? ""}
                        placeholder="ヘッド"
                        className="no-print w-24 shrink-0 rounded-sm border border-dashed border-transparent bg-transparent px-0.5 text-[8pt] text-gray-600 outline-none hover:border-sky-400 focus:border-sky-600 focus:bg-sky-50"
                      />
                    ) : (
                      <input type="hidden" name={`head_${t.line_no}`} value="" />
                    )}
                  </span>
                ),
                maker: t.product?.manufacturer ?? "",
                price: <Money v={t.product?.list_price ?? null} />,
                memo: <input name={`memo_${t.line_no}`} defaultValue={t.memo ?? ""} className={PIN} />,
              }))}
            />
          </div>
        </div>

        <section className={cardCls}>
          <SectionTitle right={<p className="text-xs text-(--color-dim)">ここは紙には出ません（伝票の掛け率・返金に使います）</p>}>
            フィッティングの設定
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={labelCls}>ご連絡先</span>
              <input name="customer_contact" defaultValue={f.customer_contact ?? ""} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>フィッティング料</span>
              <select name="fitting_minutes" defaultValue={f.fitting_minutes ?? ""} className={inputCls}>
                <option value="">なし</option>
                <option value="110">110分（22,000円）</option>
                <option value="55">55分（16,500円）</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>割引区分（伝票の掛け率が決まります）</span>
              <select name="segment" defaultValue={f.segment} className={inputCls}>
                <option value="visitor_no_fitting">フィッティング歴なし（一見のお客様）</option>
                <option value="visitor_or_intro">フィッティング歴あり／プロ紹介／再フィッティング／旧会員</option>
                <option value="member_paid_fitting">フィッティング料をお支払いの会員</option>
                <option value="from_demo_or_lesson">試打からのご購入／レッスン時のご購入</option>
              </select>
            </label>
            <label className="block sm:col-span-3">
              <span className={labelCls}>メモ</span>
              <input name="note" defaultValue={f.note ?? ""} className={inputCls} />
            </label>
          </div>
        </section>

        <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-(--color-line) bg-white/95 p-3 shadow-lg backdrop-blur">
          <button className={btnCls}>保存する</button>
          <PrintButtons items={[{ doc: "cover", label: "表紙を印刷" }]} />
          <span className="text-xs text-(--color-dim)">
            試打NOを入れて【保存する】と、シャフト名・メーカー・定価が出ます。左端のチェック＝採用（伝票に写す）。
          </span>
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
