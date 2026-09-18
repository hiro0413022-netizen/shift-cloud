import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getQuote, listPurchaseDrafts, listSalesPostings, PO_STATUS_LABELS } from "@/lib/craft";
import { jpDate, md, Money, ORDER_STEPS, OrderBottom, QuotePaper, sumsOf, toPaperItems } from "@/components/paper";
import { finishInfoOf } from "@/lib/paper-data";
import { GOLFWING_POOL_URL, golfwingOrderUrl } from "@/lib/links";
import { OrderButton } from "@/components/order-button";
import { PrintButtons } from "@/components/print-frame";
import { range, yen } from "@/lib/format";
import { btnCls, btnGhostCls, cardCls, inputCls, labelCls, SectionTitle } from "@/components/ui";
import { QuoteNav } from "@/components/nav";
import { addSpecLine, createWorkOrder, removeSpecLine, saveSpecs, saveWork } from "./actions";

export const dynamic = "force-dynamic";

const CELL = "w-full rounded border border-(--color-line) px-1.5 py-1 text-xs";
/** 紙の上の入力欄（点線。印刷には出ない） */
const PIN =
  "w-full rounded-sm border border-dashed border-transparent bg-transparent px-0.5 outline-none hover:border-sky-400 focus:border-sky-600 focus:bg-sky-50";

export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const full = await getQuote(actor, Number(id));
  if (!full) notFound();
  const { quote: q, items, work, specs } = full;
  const [pos, postings] = await Promise.all([
    listPurchaseDrafts(actor, full.work?.id ?? null),
    listSalesPostings(actor, Number(id)),
  ]);
  const orderable = items.filter((it) => ["product", "grip", "sleeve", "coating"].includes(it.line_kind ?? ""));

  if (!work) {
    return (
      <>
        <QuoteNav id={id} active="work" />
        <section className={cardCls}>
          <h2 className="mb-2 text-sm font-bold">注文書はまだありません</h2>
          <p className="mb-4 text-sm text-(--color-dim)">
            ご注文がお決まりになったら注文書を作ります。見積のシャフト{" "}
            {items.filter((i) => i.line_kind === "product" && i.item_category === "シャフト").length} 本ぶん、
            組立指示書の行を用意します。
          </p>
          <form action={createWorkOrder}>
            <input type="hidden" name="quote_id" value={q.id} />
            <button className={btnCls}>注文書をつくる</button>
          </form>
        </section>
      </>
    );
  }

  const itemById = new Map(items.map((i) => [i.id, i]));
  const paperItems = toPaperItems(items, full.priced.items);
  const t = full.priced.totals;

  return (
    <>
      <QuoteNav id={id} active="work" />

      {/* 御注文書そのもの（印刷と同じ紙）。点線の欄はここで直して【保存】 */}
      <form action={saveWork} className="mb-6">
        <input type="hidden" name="quote_id" value={q.id} />
        {/* Enter で送ったときは「保存」だけ（先頭の送信ボタンが既定になるので、印刷ボタンより前に置く） */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          保存
        </button>
        <div className="overflow-x-auto rounded-xl border border-(--color-line) bg-(--color-panel-2) p-3 sm:p-6">
          <div className="mx-auto mb-3 min-w-[760px] max-w-[210mm]">
            <PrintButtons
              items={[
                { doc: "order", label: "御注文書を印刷", primary: true },
                { doc: "spec", label: "組立指示書を印刷" },
              ]}
            />
          </div>
          <div className="mx-auto min-w-[760px] max-w-[210mm] bg-white p-8 text-black shadow-md">
            <QuotePaper
              doc="order"
              customerName={q.customer_name}
              contact={q.customer_contact ?? ""}
              date={jpDate(work.order_date ?? q.quote_date)}
              subject={q.subject}
              delivery={
                <span className="flex items-center gap-2">
                  <input type="date" name="due_date" defaultValue={work.due_date ?? ""} className={PIN} />
                  {!work.due_date && <span className="no-print shrink-0 text-[8pt] text-gray-400">{q.delivery_note}</span>}
                </span>
              }
              payment={q.payment_terms}
              validity={q.validity_note}
              staffName={q.staff_name ?? ""}
              total={full.priced.totals.total}
              items={paperItems}
              bottom={
                <OrderBottom
                  info={finishInfoOf(full)}
                  totals={[
                    { label: "小計", value: <Money v={t.subtotal} zero />, sums: sumsOf(paperItems) },
                    { label: "消費税", value: <Money v={t.tax} zero /> },
                    ...(t.refund > 0 ? [{ label: "返金", value: <>▲¥{t.refund.toLocaleString("ja-JP")}</> }] : []),
                    { label: "前受金", value: <Money v={t.prepaid} zero /> },
                    { label: "合計", value: <Money v={t.total} zero />, strong: true },
                  ]}
                  reveColor={<input name="reve_color" defaultValue={work.reve_color ?? ""} className={PIN} />}
                  reveSerial={<input name="reve_serial" defaultValue={work.reve_serial ?? ""} className={PIN} />}
                  steps={ORDER_STEPS.map((st) => ({
                    label: st.label,
                    value: (
                      <input
                        name={st.key}
                        defaultValue={work[st.key] ? md(work[st.key]) : ""}
                        placeholder="／"
                        title="例: 9/18（「今日」でも入ります）"
                        className={`${PIN} text-center`}
                      />
                    ),
                  }))}
                  memo={<textarea name="work_note" defaultValue={work.note ?? ""} rows={3} className={`${PIN} h-full resize-none`} />}
                />
              }
            />
          </div>
          <div className="mx-auto mt-3 flex min-w-[760px] max-w-[210mm] flex-wrap items-end gap-3 rounded-lg border border-(--color-line) bg-white p-3">
            <label className="block">
              <span className={labelCls}>組立担当</span>
              <input name="assembled_by_name" defaultValue={work.assembled_by_name ?? ""} className={`${inputCls} w-40`} />
            </label>
            <button className={btnCls}>注文書を保存</button>
            <PrintButtons
              items={[
                { doc: "order", label: "御注文書を印刷" },
                { doc: "spec", label: "組立指示書を印刷" },
              ]}
            />
            <span className="text-xs text-(--color-dim)">
              {work.order_no}・日付は「9/18」の形で。お渡しを入れると売上が Money OS に入ります。仕上げ情報は下の組立指示書の1本目から出ます。
            </span>
          </div>
        </div>
      </form>

      <form action={saveSpecs}>
        <input type="hidden" name="quote_id" value={q.id} />
        <section className={cardCls}>
          <SectionTitle
            right={
              <span className="text-xs text-(--color-dim)">
                目標は範囲で、組み上がりは実測で残します
              </span>
            }
          >
            組立指示書
          </SectionTitle>

          {specs.length === 0 ? (
            <p className="py-6 text-center text-sm text-(--color-dim)">行がありません。下の【行を足す】から作ってください。</p>
          ) : (
            <div className="space-y-6">
              {specs.map((s) => {
                const it = s.quote_item_id ? itemById.get(s.quote_item_id) : null;
                return (
                  <div key={s.id} className="rounded-lg border border-(--color-line) p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1 text-xs text-(--color-dim)">
                        優先順位
                        <input name={`prio_${s.id}`} defaultValue={s.priority ?? ""} className="w-12 rounded border border-(--color-line) px-1.5 py-1 text-xs" />
                      </label>
                      <span className="text-sm font-medium">
                        {it ? `${it.manufacturer ?? ""} ${it.product_name}${it.spec ? ` ${it.spec}` : ""}` : "（見積の明細に紐づいていない行）"}
                      </span>
                      {it?.club_type && <span className="text-xs text-(--color-dim)">{it.club_type}</span>}
                      <button
                        formAction={removeSpecLine.bind(null, s.id)}
                        className="ml-auto text-xs text-red-500 hover:underline"
                      >
                        この行を削除
                      </button>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-bold text-(--color-dim)">目標</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="block">
                            <span className={labelCls}>装着ヘッド</span>
                            <input name={`head_${s.id}`} defaultValue={s.head_name ?? ""} className={CELL} />
                          </label>
                          <label className="block">
                            <span className={labelCls}>ヘッド重量（g）</span>
                            <input name={`hw_${s.id}`} defaultValue={s.head_weight ?? ""} className={CELL} />
                          </label>
                          <div>
                            <span className={labelCls}>振動数（cpm）</span>
                            <div className="flex items-center gap-1">
                              <input name={`cpm_min_${s.id}`} defaultValue={s.cpm_min ?? ""} className={CELL} />
                              <span className="text-xs">〜</span>
                              <input name={`cpm_max_${s.id}`} defaultValue={s.cpm_max ?? ""} className={CELL} />
                            </div>
                          </div>
                          <div>
                            <span className={labelCls}>バランス</span>
                            <div className="flex items-center gap-1">
                              <input name={`bal_min_${s.id}`} defaultValue={s.balance_min ?? ""} placeholder="D2" className={CELL} />
                              <span className="text-xs">〜</span>
                              <input name={`bal_max_${s.id}`} defaultValue={s.balance_max ?? ""} placeholder="D3" className={CELL} />
                            </div>
                          </div>
                          <div>
                            <span className={labelCls}>長さ（inch）</span>
                            <div className="flex items-center gap-1">
                              <input name={`len_min_${s.id}`} defaultValue={s.length_min ?? ""} className={CELL} />
                              <span className="text-xs">〜</span>
                              <input name={`len_max_${s.id}`} defaultValue={s.length_max ?? ""} className={CELL} />
                            </div>
                          </div>
                          <div>
                            <span className={labelCls}>総重量（g）</span>
                            <div className="flex items-center gap-1">
                              <input name={`wt_min_${s.id}`} defaultValue={s.weight_min ?? ""} className={CELL} />
                              <span className="text-xs">〜</span>
                              <input name={`wt_max_${s.id}`} defaultValue={s.weight_max ?? ""} className={CELL} />
                            </div>
                          </div>
                          <label className="block">
                            <span className={labelCls}>ネジ</span>
                            <select name={`screw_${s.id}`} defaultValue={s.screw ?? ""} className={CELL}>
                              <option value="">—</option>
                              <option value="有り">有り</option>
                              <option value="無し">無し</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className={labelCls}>グリップ</span>
                            <select name={`layers_${s.id}`} defaultValue={s.grip_layers ?? ""} className={CELL}>
                              <option value="">—</option>
                              <option value="1重">1重</option>
                              <option value="2重">2重</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className={labelCls}>巻き方</span>
                            <select name={`wrap_${s.id}`} defaultValue={s.grip_wrap ?? ""} className={CELL}>
                              <option value="">—</option>
                              <option value="螺旋">螺旋</option>
                              <option value="縦">縦</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className={labelCls}>スリーブ</span>
                            <select name={`sleeve_${s.id}`} defaultValue={s.sleeve_source ?? ""} className={CELL}>
                              <option value="">—</option>
                              <option value="再利用">再利用</option>
                              <option value="購入">購入</option>
                              <option value="他">他</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className={labelCls}>ポジション</span>
                            <input name={`pos_${s.id}`} defaultValue={s.sleeve_position ?? ""} className={CELL} />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className={labelCls}>備考</span>
                            <input name={`note_${s.id}`} defaultValue={s.spec_note ?? ""} className={CELL} />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-lg bg-(--color-panel-2) p-3">
                        <p className="mb-2 text-xs font-bold text-(--color-dim)">
                          組み上がり（実測）— 次回「前回の仕上がり」として出ます
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="block">
                            <span className={labelCls}>振動数（cpm）</span>
                            <input name={`a_cpm_${s.id}`} defaultValue={s.actual_cpm ?? ""} className={CELL} />
                          </label>
                          <label className="block">
                            <span className={labelCls}>バランス</span>
                            <input name={`a_bal_${s.id}`} defaultValue={s.actual_balance ?? ""} className={CELL} />
                          </label>
                          <label className="block">
                            <span className={labelCls}>長さ（inch）</span>
                            <input name={`a_len_${s.id}`} defaultValue={s.actual_length ?? ""} className={CELL} />
                          </label>
                          <label className="block">
                            <span className={labelCls}>総重量（g）</span>
                            <input name={`a_wt_${s.id}`} defaultValue={s.actual_weight ?? ""} className={CELL} />
                          </label>
                          <label className="block">
                            <span className={labelCls}>ヘッド重量（g）</span>
                            <input name={`a_hw_${s.id}`} defaultValue={s.actual_head_weight ?? ""} className={CELL} />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className={labelCls}>組立メモ</span>
                            <input name={`a_note_${s.id}`} defaultValue={s.actual_note ?? ""} className={CELL} />
                          </label>
                        </div>
                        <p className="mt-2 text-[11px] text-(--color-dim)">
                          目標 {range(s.cpm_min, s.cpm_max, "cpm") || "—"} ／ {range(s.balance_min, s.balance_max) || "—"} ／{" "}
                          {range(s.length_min, s.length_max, "inch") || "—"} ／ {range(s.weight_min, s.weight_max, "g") || "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button className={btnCls}>組立仕様を保存</button>
            <button formAction={addSpecLine} className={btnGhostCls}>
              行を足す
            </button>
          </div>
        </section>
      </form>

      <section className={`${cardCls} mt-6`}>
        <SectionTitle
          right={
            pos.length === 0 && orderable.length > 0 ? (
              <OrderButton quoteId={q.id} />
            ) : pos.length > 0 ? (
              <a href={GOLFWING_POOL_URL} target="_blank" rel="noreferrer" className={btnGhostCls}>
                発注管理の発注プールを開く
              </a>
            ) : null
          }
        >
          発注
        </SectionTitle>

        {pos.length === 0 ? (
          <p className="text-sm text-(--color-dim)">
            {orderable.length === 0
              ? "取り寄せる商品の明細がありません。"
              : "押すと、仕入先ごとに発注管理の「発注プール」へ入り、オーダー用紙が別タブで開きます。送るのはいつもどおり発注管理の画面からです。"}
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="py-2 pr-3">発注番号</th>
                  <th className="py-2 pr-3">仕入先</th>
                  <th className="py-2 pr-3">発注日</th>
                  <th className="py-2 pr-3 text-right">品数</th>
                  <th className="py-2">状態</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.purchase_order_id} className="border-b border-(--color-line) last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <a href={golfwingOrderUrl(p.purchase_order_id)} target="_blank" rel="noreferrer" className="text-(--color-accent) underline">
                        {p.order_no}
                      </a>
                    </td>
                    <td className="py-2 pr-3">{p.supplier ?? "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-(--color-dim)">{p.order_date}</td>
                    <td className="py-2 pr-3 text-right">{p.itemCount}</td>
                    <td className="py-2">{PO_STATUS_LABELS[p.status] ?? p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-(--color-dim)">
              発注管理で入荷を登録すると、上の「到着」日が自動で入ります。
            </p>
          </>
        )}
      </section>

      <p className="mt-4 text-xs text-(--color-dim)">
        この注文書の合計は {yen(full.priced.totals.total)} です（税込）。
        {postings.length > 0
          ? `売上は ${postings.length} 行ぶん Money OS に計上済みです。`
          : "お渡し日を入れると、Money OS へ売上を計上します。"}
      </p>
    </>
  );
}
