import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getQuote, listPurchaseDrafts, listSalesPostings, PO_STATUS_LABELS, WORK_STEPS } from "@/lib/craft";
import { range, yen } from "@/lib/format";
import { btnCls, btnGhostCls, cardCls, inputCls, labelCls, SectionTitle } from "@/components/ui";
import { QuoteNav } from "@/components/nav";
import { addSpecLine, createPurchaseDrafts, createWorkOrder, removeSpecLine, saveSpecs, saveWork } from "./actions";

export const dynamic = "force-dynamic";

const CELL = "w-full rounded border border-(--color-line) px-1.5 py-1 text-xs";

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

  return (
    <>
      <QuoteNav id={id} active="work" />

      <form action={saveWork} className="mb-6">
        <input type="hidden" name="quote_id" value={q.id} />
        <section className={cardCls}>
          <SectionTitle
            right={
              <div className="flex gap-2">
                <Link href={`/print/order/${id}`} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs">
                  御注文書を印刷
                </Link>
                <Link href={`/print/spec/${id}`} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs">
                  工房の指示書を印刷
                </Link>
              </div>
            }
          >
            {work.order_no} の進み具合
          </SectionTitle>

          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {WORK_STEPS.map((s) => (
              <label key={s.key} className="block">
                <span className={labelCls}>{s.label}</span>
                <input
                  type="date"
                  name={s.key}
                  defaultValue={(work[s.key] as string | null) ?? ""}
                  className={`${inputCls} px-2 py-1 text-xs`}
                />
              </label>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className={labelCls}>仕上げ期日</span>
              <input type="date" name="due_date" defaultValue={work.due_date ?? ""} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>組立担当</span>
              <input name="assembled_by_name" defaultValue={work.assembled_by_name ?? ""} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>REVE カラー</span>
              <input name="reve_color" defaultValue={work.reve_color ?? ""} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>REVE シリアル番号</span>
              <input name="reve_serial" defaultValue={work.reve_serial ?? ""} className={inputCls} />
            </label>
            <label className="block sm:col-span-4">
              <span className={labelCls}>MEMO</span>
              <input name="work_note" defaultValue={work.note ?? ""} className={inputCls} />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button className={btnCls}>進み具合を保存</button>
            <span className="text-xs text-(--color-dim)">
              入荷登録（発注管理）とつなぐと「到着」は自動で立ちます。いまは手入力です。
            </span>
          </div>
        </section>
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
              <form action={createPurchaseDrafts}>
                <input type="hidden" name="quote_id" value={q.id} />
                <button className={btnGhostCls}>発注の下書きをつくる</button>
              </form>
            ) : null
          }
        >
          発注
        </SectionTitle>

        {pos.length === 0 ? (
          <p className="text-sm text-(--color-dim)">
            {orderable.length === 0
              ? "取り寄せる商品の明細がありません。"
              : "押すと、仕入先ごとに発注管理の「発注プール」へ下書きが入ります。送るのはいつもどおり発注管理の画面からです。"}
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
                    <td className="py-2 pr-3 whitespace-nowrap">{p.order_no}</td>
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
