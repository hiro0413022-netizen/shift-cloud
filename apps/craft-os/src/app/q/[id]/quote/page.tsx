import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getFitting, getLaborRates, getQuote, listSalesPostings, refundBreakdown, QUOTE_STATUS_LABELS } from "@/lib/craft";
import { offLabel, yen, yenPlain } from "@/lib/format";
import { btnCls, btnGhostCls, cardCls, inputCls, labelCls, SectionTitle } from "@/components/ui";
import { QuoteNav } from "@/components/nav";
import { ProductPicker } from "./product-picker";
import { addFreeLine, addLaborLine, issueQuoteDoc, markReviewed, postSalesNow, removeItem, setStatus, updateItems } from "../actions";
import { adoptTrialInto } from "@/app/f/[id]/actions";

export const dynamic = "force-dynamic";

const RATE_OPTIONS = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const full = await getQuote(actor, Number(id));
  if (!full) notFound();
  const { quote: q, items, priced } = full;
  const labor = await getLaborRates(actor);
  const refund = refundBreakdown(full);
  const isOwnQuote = q.created_by === actor.staffId;
  // 表紙が紐づいていれば、試打したシャフトをここからそのまま入れられる
  const cover = full.fitting ? await getFitting(actor, full.fitting.id) : null;
  const coverTrials = (cover?.trials ?? []).filter((t) => t.product);
  const postings = await listSalesPostings(actor, Number(id));

  return (
    <>
      <QuoteNav id={id} active="quote" />

      <form action={updateItems} className="space-y-6">
        <input type="hidden" name="quote_id" value={q.id} />

        <section className={cardCls}>
          <SectionTitle
            right={
              <div className="flex flex-wrap gap-2">
                <Link href={`/print/order/${id}`} className="rounded-lg bg-(--color-accent) px-3 py-1.5 text-xs font-medium text-white">
                  御注文書を印刷
                </Link>
                <Link href={`/print/quote/${id}`} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs">
                  御見積書を印刷
                </Link>
              </div>
            }
          >
            明細
          </SectionTitle>

          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-(--color-dim)">
              まだ明細がありません。下の商品検索から入れてください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                    <th className="py-2 pr-2">区分</th>
                    <th className="py-2 pr-2">商品名</th>
                    <th className="py-2 pr-2">メーカー</th>
                    <th className="py-2 pr-2 text-right">定価</th>
                    <th className="py-2 pr-2">掛け率</th>
                    <th className="py-2 pr-2 text-right">値引額</th>
                    <th className="py-2 pr-2 text-right">数量</th>
                    <th className="py-2 pr-2 text-right">金額</th>
                    <th className="py-2 pr-2">仕上げ長さ</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const p = priced.items[i];
                    return (
                      <tr key={it.id} className="border-b border-(--color-line) align-top last:border-0">
                        <td className="py-2 pr-2 text-xs text-(--color-dim)">
                          {it.item_category ?? "—"}
                          {it.demo_no ? <div>試打 {it.demo_no}</div> : null}
                        </td>
                        <td className="py-2 pr-2">
                          {it.product_name}
                          {it.spec ? ` ${it.spec}` : ""}
                          {it.club_type ? <span className="ml-1 text-xs text-(--color-dim)">{it.club_type}</span> : null}
                          {it.note ? <div className="text-[11px] text-amber-700">{it.note}</div> : null}
                        </td>
                        <td className="py-2 pr-2 text-xs text-(--color-dim)">{it.manufacturer ?? "—"}</td>
                        <td className="py-2 pr-2 text-right">{yenPlain(Number(it.list_price))}</td>
                        <td className="py-2 pr-2">
                          <select
                            name={`rate_${it.id}`}
                            defaultValue={it.discount_manual ? String(it.discount_rate ?? "") : "auto"}
                            className={`${inputCls} px-2 py-1 text-xs`}
                          >
                            <option value="auto">自動（{offLabel(p?.rate ?? null)}）</option>
                            {RATE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {r} — {offLabel(r)}
                              </option>
                            ))}
                          </select>
                          {it.discount_manual && (
                            <input
                              name={`reason_${it.id}`}
                              defaultValue={it.discount_reason ?? ""}
                              placeholder="理由（必須）"
                              className={`${inputCls} mt-1 px-2 py-1 text-xs`}
                            />
                          )}
                          <div className="mt-1 text-[11px] text-(--color-dim)">{p?.discountReason}</div>
                        </td>
                        <td className="py-2 pr-2 text-right">{yenPlain(p?.discountAmount ?? 0)}</td>
                        <td className="py-2 pr-2 text-right">
                          <input
                            name={`qty_${it.id}`}
                            defaultValue={it.quantity ?? 1}
                            inputMode="numeric"
                            className={`${inputCls} w-16 px-2 py-1 text-right text-xs`}
                          />
                        </td>
                        <td className="py-2 pr-2 text-right font-medium">{yenPlain(p?.amount ?? 0)}</td>
                        <td className="py-2 pr-2">
                          {it.line_kind === "product" && it.item_category === "シャフト" ? (
                            <input
                              name={`finish_${it.id}`}
                              defaultValue={it.finish_length_inch ?? ""}
                              placeholder="inch"
                              className={`${inputCls} w-20 px-2 py-1 text-xs`}
                            />
                          ) : null}
                        </td>
                        <td className="py-2">
                          <button
                            formAction={removeItem}
                            name="item_id"
                            value={it.id}
                            className="text-xs text-red-500 hover:underline"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={cardCls}>
          <SectionTitle>合計</SectionTitle>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <label className="block">
                <span className={labelCls}>税別品</span>
                <input name="tax_free_amount" defaultValue={Number(q.tax_free_amount)} className={inputCls} inputMode="numeric" />
              </label>
              <label className="block">
                <span className={labelCls}>前受金（合計から差し引きます）</span>
                <input name="prepaid_amount" defaultValue={Number(q.prepaid_amount)} className={inputCls} inputMode="numeric" />
              </label>
              <div className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="refund_auto" defaultChecked={q.refund_auto} />
                  フィッティング料の返金を自動で計算する
                </label>
                <div className="mt-2 text-xs text-(--color-dim)">
                  {full.fitting?.fitting_minutes ? (
                    <>
                      <div>
                        DR {refund.counts.DR ?? 0}本／FW {refund.counts.FW ?? 0}本／UT {refund.counts.UT ?? 0}本
                      </div>
                      {refund.breakdown.map((b, i) => (
                        <div key={i}>{b}</div>
                      ))}
                      <div className="mt-1 font-medium text-(--color-txt)">返金 {yen(refund.amount)}</div>
                    </>
                  ) : (
                    <div>
                      {full.fitting
                        ? "この表紙ではフィッティング料のご利用がありません（表紙で設定できます）"
                        : "フィッティングを伴わない伝票のため、返金はありません"}
                    </div>
                  )}
                </div>
                {!q.refund_auto && (
                  <input
                    name="refund_amount"
                    defaultValue={Number(q.refund_amount)}
                    className={`${inputCls} mt-2`}
                    inputMode="numeric"
                  />
                )}
                <input name="refund_note" defaultValue={q.refund_note ?? ""} placeholder="返金のメモ" className={`${inputCls} mt-2 text-xs`} />
              </div>
              <label className="block">
                <span className={labelCls}>備考（御見積書に出ます）</span>
                <textarea name="note" defaultValue={q.note ?? ""} rows={3} className={inputCls} />
              </label>
            </div>

            <dl className="space-y-2 self-start rounded-lg border border-(--color-line) p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-(--color-dim)">小計</dt>
                <dd>{yen(priced.totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-(--color-dim)">消費税（{Math.round(Number(q.tax_rate) * 100)}%）</dt>
                <dd>{yen(priced.totals.tax)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-(--color-dim)">税別品</dt>
                <dd>{yen(priced.totals.taxFree)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-(--color-dim)">フィッティング料 返金</dt>
                <dd>▲ {yen(priced.totals.refund)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-(--color-dim)">前受金</dt>
                <dd>▲ {yen(priced.totals.prepaid)}</dd>
              </div>
              <div className="mt-2 flex justify-between border-t border-(--color-line) pt-2 text-lg font-bold">
                <dt>合計（税込）</dt>
                <dd>{yen(priced.totals.total)}</dd>
              </div>
              <p className="pt-2 text-[11px] text-(--color-dim)">
                返金は消費税のあとに税込で差し引いています（22,000・16,500・11,000・8,250 はいずれも税抜×1.1 の料金表の金額のため）。
              </p>
            </dl>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className={btnCls}>保存する</button>
          </div>
        </section>
      </form>

      <section className={`${cardCls} mt-6`}>
        <SectionTitle>明細を足す</SectionTitle>
        <div className="space-y-6">
          {coverTrials.length > 0 && (
            <div>
              <p className={labelCls}>表紙（{full.fitting?.fitting_no}）で試打したシャフトから入れる</p>
              <ul className="divide-y divide-(--color-line) rounded-lg border border-(--color-line)">
                {coverTrials.map((t) => (
                  <li key={t.id}>
                    <form action={adoptTrialInto} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-(--color-panel-2)">
                      <input type="hidden" name="fitting_id" value={full.fitting!.id} />
                      <input type="hidden" name="quote_id" value={q.id} />
                      <input type="hidden" name="trial_id" value={t.id} />
                      <span className="w-16 shrink-0 text-xs text-(--color-dim)">試打 {t.demo_no}</span>
                      <span className="w-28 shrink-0 text-xs text-(--color-dim)">{t.product?.manufacturer}</span>
                      <span className="flex-1">
                        {t.product?.name}
                        {t.product?.spec ? ` ${t.product.spec}` : ""}
                        {t.product?.club_type ? <span className="ml-1 text-xs text-(--color-dim)">{t.product.club_type}</span> : null}
                      </span>
                      <span className="w-24 shrink-0 text-right">{yenPlain(t.product?.list_price ?? 0)}</span>
                      <button className="shrink-0 rounded border border-(--color-line) px-2 py-1 text-xs">入れる</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className={labelCls}>商品マスタから探す</p>
            <ProductPicker quoteId={q.id} />
          </div>

          <form action={addLaborLine} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="quote_id" value={q.id} />
            <label className="block">
              <span className={labelCls}>工賃・加工</span>
              <select name="labor_code" className={`${inputCls} w-72`}>
                {labor.map((r) => (
                  <option key={r.code} value={r.code}>
                    [{r.quote_section}] {r.name}
                    {r.price != null ? ` — ${r.price.toLocaleString("ja-JP")}円` : r.price_note ? ` — ${r.price_note}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>料金の種類</span>
              <select name="price_kind" className={`${inputCls} w-48`}>
                <option value="price">通常（商品ご購入あり）</option>
                <option value="bring_in">フィッティング時持ち込み</option>
                <option value="no_purchase">購入なし持ち込み</option>
              </select>
            </label>
            <button className={btnGhostCls}>入れる</button>
          </form>

          <form action={addFreeLine} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="quote_id" value={q.id} />
            <label className="block">
              <span className={labelCls}>マスタに無いものを手で入れる</span>
              <input name="free_name" placeholder="商品名" className={`${inputCls} w-64`} />
            </label>
            <label className="block">
              <span className={labelCls}>区分</span>
              <input name="free_category" placeholder="シャフト など" className={`${inputCls} w-32`} />
            </label>
            <label className="block">
              <span className={labelCls}>メーカー</span>
              <input name="free_maker" className={`${inputCls} w-32`} />
            </label>
            <label className="block">
              <span className={labelCls}>番手</span>
              <select name="free_club_type" className={`${inputCls} w-24`} defaultValue="">
                <option value="">—</option>
                <option value="DR">DR</option>
                <option value="FW">FW</option>
                <option value="UT">UT</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>定価</span>
              <input name="free_price" inputMode="numeric" className={`${inputCls} w-28`} />
            </label>
            <label className="block">
              <span className={labelCls}>数量</span>
              <input name="free_qty" defaultValue={1} inputMode="numeric" className={`${inputCls} w-20`} />
            </label>
            <button className={btnGhostCls}>入れる</button>
          </form>
          <p className="text-xs text-(--color-dim)">
            手入力した行は「商品マスタに無い」印がつきます。よく出るものは発注管理の商品マスタに登録してください。
          </p>
        </div>
      </section>

      <section className={`${cardCls} mt-6`}>
        <SectionTitle>社内チェックと状態</SectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          {q.reviewed_at ? (
            <p className="text-sm text-(--color-ok)">
              社内確認済み（{new Date(q.reviewed_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）
            </p>
          ) : (
            <form action={markReviewed}>
              <input type="hidden" name="quote_id" value={q.id} />
              <button className={btnGhostCls} disabled={isOwnQuote}>
                {isOwnQuote ? "ご自身の見積は確認できません" : "内容を確認しました"}
              </button>
            </form>
          )}
          <form action={setStatus} className="flex items-end gap-2">
            <input type="hidden" name="quote_id" value={q.id} />
            <select name="status" defaultValue={q.status} className={`${inputCls} w-44`}>
              {["draft", "presented", "accepted", "void"].map((s) => (
                <option key={s} value={s}>
                  {QUOTE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button className={btnGhostCls}>状態を変える</button>
          </form>
          {q.quote_issued_at ? (
            <p className="text-xs text-(--color-dim)">
              御見積書 発行済み（{new Date(q.quote_issued_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）
            </p>
          ) : (
            <form action={issueQuoteDoc}>
              <input type="hidden" name="quote_id" value={q.id} />
              <button className={btnGhostCls}>御見積書を出した</button>
            </form>
          )}
          {postings.length > 0 ? (
            <p className="text-xs text-(--color-ok)">
              売上計上済み（{postings.length}行・
              {new Date(postings[0].posted_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}）
            </p>
          ) : items.length > 0 && !full.work ? (
            <form action={postSalesNow}>
              <input type="hidden" name="quote_id" value={q.id} />
              <button className={btnGhostCls}>売上を計上する</button>
            </form>
          ) : null}
          <Link href={`/q/${id}/work`} className={btnCls}>
            注文書・工房へ
          </Link>
        </div>
        <p className="mt-3 text-xs text-(--color-dim)">
          「お客様にお渡しする前に、必ず他のスタッフのチェックを受けてから提示」— 誰がいつ確認したかを残します。
          御見積書は出しても出さなくても構いません。ご注文書だけで完結する伝票が多いためです。
          工房を通す伝票は、お渡し日を入れた時点で売上が Money OS に入ります。
        </p>
      </section>
    </>
  );
}
