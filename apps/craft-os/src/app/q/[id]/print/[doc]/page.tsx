import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getQuote, refundBreakdown, WORK_STEPS, type QuoteItem, type WorkSpec } from "@/lib/craft";
import { dateShort, range, yenPlain } from "@/lib/format";
import { PrintToolbar } from "@/components/print-frame";

export const dynamic = "force-dynamic";

/**
 * 帳票。いまファイルに綴じている紙と同じ形にしてある（運用を変えずに中身だけ置き換えるため）。
 *   quote … 御見積書（A4縦）
 *   order … 御注文書（A4縦）＋仕上げ情報・進捗欄
 *   spec  … 工房の組立指示書（A4横）
 */

const ISSUER = {
  name: "株式会社ファイン",
  zip: "〒665-0882",
  address: "兵庫県宝塚市山本南１−２６−２５",
  tel: "TEL／FAX　0797-82-0833",
  bank: "三菱UFJ銀行　信濃橋支店　（普通）0235311　口座名義　株式会社ファイン",
};

const sheetCls = "print-sheet mx-auto bg-white p-10 shadow-sm";

export default async function PrintPage({ params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  if (!["quote", "order", "spec"].includes(doc)) notFound();
  const actor = await requireActor();
  const full = await getQuote(actor, Number(id));
  if (!full) notFound();
  const { quote: q, items, work, specs, priced } = full;
  const refund = refundBreakdown(q, items);
  const landscape = doc === "spec";
  const title = doc === "quote" ? "御見積書" : doc === "order" ? "御注文書" : "組立指示書";

  return (
    <>
      <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }`}</style>
      <PrintToolbar title={title} note={`A4${landscape ? "横" : "縦"} ／ ${q.quote_no}${work ? ` ／ ${work.order_no}` : ""}`} />

      <div className={`${sheetCls} ${landscape ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
        {doc === "spec" ? (
          <SpecSheet
            customer={q.customer_name}
            fitter={q.fitter_name}
            date={q.fitting_date ?? q.quote_date}
            due={work?.due_date ?? null}
            assembledBy={work?.assembled_by_name ?? null}
            orderNo={work?.order_no ?? null}
            specs={specs}
            items={items}
          />
        ) : (
          <>
            <header className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-widest">{title}</h1>
                <p className="mt-6 border-b border-black pb-1 text-lg">
                  {q.customer_name} <span className="ml-2 text-sm">様</span>
                </p>
                {q.customer_contact && <p className="mt-1 text-xs">ご連絡先：{q.customer_contact}</p>}
              </div>
              <div className="text-right text-xs leading-6">
                <p>
                  {doc === "quote" ? "見積日" : "注文日"}　{dateShort(doc === "quote" ? q.quote_date : (work?.order_date ?? q.quote_date))}
                </p>
                <p className="mt-2 font-bold">{ISSUER.name}</p>
                <p>{ISSUER.zip}</p>
                <p>{ISSUER.address}</p>
                <p>{ISSUER.tel}</p>
                <p className="mt-2">担当：{q.staff_name ?? q.fitter_name ?? ""}</p>
              </div>
            </header>

            <table className="mb-4 w-full text-xs">
              <tbody>
                <tr>
                  <td className="w-20 py-0.5">件名：</td>
                  <td>{q.subject}</td>
                </tr>
                <tr>
                  <td className="py-0.5">納期：</td>
                  <td>{work?.due_date ? dateShort(work.due_date) : q.delivery_note}</td>
                </tr>
                <tr>
                  <td className="py-0.5">支払条件：</td>
                  <td>{q.payment_terms}</td>
                </tr>
                {doc === "quote" && (
                  <tr>
                    <td className="py-0.5">有効期限：</td>
                    <td>{q.validity_note}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mb-6 flex items-end gap-4 border-y-2 border-black py-3">
              <span className="text-sm font-bold">合計金額</span>
              <span className="text-3xl font-bold">{yenPlain(priced.totals.total)}</span>
              <span className="text-xs">（税込）</span>
            </div>

            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y border-black">
                  <th className="w-12 py-1 text-left">試打<br />NO.</th>
                  <th className="w-16 py-1 text-left">種類</th>
                  <th className="py-1 text-left">商品名</th>
                  <th className="w-24 py-1 text-left">メーカー名</th>
                  <th className="w-20 py-1 text-right">定価</th>
                  <th className="w-20 py-1 text-right">割引額</th>
                  <th className="w-12 py-1 text-right">数量</th>
                  <th className="w-24 py-1 text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const p = priced.items[i];
                  return (
                    <tr key={it.id} className="border-b border-gray-300">
                      <td className="py-1">{it.demo_no ?? ""}</td>
                      <td className="py-1">{it.club_type ?? it.item_category ?? ""}</td>
                      <td className="py-1">
                        {it.product_name}
                        {it.spec ? ` ${it.spec}` : ""}
                      </td>
                      <td className="py-1">{it.manufacturer ?? ""}</td>
                      <td className="py-1 text-right">{yenPlain(Number(it.list_price))}</td>
                      <td className="py-1 text-right">{p?.discountAmount ? yenPlain(p.discountAmount) : ""}</td>
                      <td className="py-1 text-right">{it.quantity}</td>
                      <td className="py-1 text-right">{yenPlain(p?.amount ?? 0)}</td>
                    </tr>
                  );
                })}
                {Array.from({ length: Math.max(0, 8 - items.length) }, (_, i) => (
                  <tr key={`pad${i}`} className="border-b border-gray-300">
                    <td className="py-2" colSpan={8}>
                      &nbsp;
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}></td>
                  <td className="border-t border-black py-1 text-right">小計</td>
                  <td className="border-t border-black py-1 text-right">{yenPlain(priced.totals.subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={6}></td>
                  <td className="py-1 text-right">消費税</td>
                  <td className="py-1 text-right">{yenPlain(priced.totals.tax)}</td>
                </tr>
                {priced.totals.taxFree !== 0 && (
                  <tr>
                    <td colSpan={6}></td>
                    <td className="py-1 text-right">税別品</td>
                    <td className="py-1 text-right">{yenPlain(priced.totals.taxFree)}</td>
                  </tr>
                )}
                {priced.totals.refund !== 0 && (
                  <tr>
                    <td colSpan={6}></td>
                    <td className="py-1 text-right">フィッティング料 返金</td>
                    <td className="py-1 text-right">▲{yenPlain(priced.totals.refund)}</td>
                  </tr>
                )}
                {priced.totals.prepaid !== 0 && (
                  <tr>
                    <td colSpan={6}></td>
                    <td className="py-1 text-right">前受金</td>
                    <td className="py-1 text-right">▲{yenPlain(priced.totals.prepaid)}</td>
                  </tr>
                )}
                <tr className="border-y-2 border-black text-sm font-bold">
                  <td colSpan={6}></td>
                  <td className="py-1 text-right">合計</td>
                  <td className="py-1 text-right">{yenPlain(priced.totals.total)}</td>
                </tr>
              </tfoot>
            </table>

            {q.fitting_minutes && refund.amount > 0 && (
              <p className="mt-3 text-[10px] text-gray-600">
                フィッティング料（{q.fitting_minutes}分）のご返金：{refund.breakdown.join(" ／ ")}
              </p>
            )}

            {doc === "order" && (
              <>
                <section className="mt-6">
                  <h2 className="mb-2 border-b border-black pb-1 text-xs font-bold">仕上げ情報</h2>
                  <table className="w-full border-collapse text-[11px]">
                    <tbody>
                      {specs.map((s) => (
                        <tr key={s.id} className="border-b border-gray-300">
                          <td className="w-8 py-1">{s.priority ?? s.line_no}</td>
                          <td className="w-40 py-1">{s.head_name ?? ""}</td>
                          <td className="py-1">振動数 {range(s.cpm_min, s.cpm_max, "cpm") || "—"}</td>
                          <td className="py-1">バランス {range(s.balance_min, s.balance_max) || "—"}</td>
                          <td className="py-1">長さ {range(s.length_min, s.length_max, "inch") || "—"}</td>
                          <td className="py-1">総重量 {range(s.weight_min, s.weight_max, "g") || "—"}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={6} className="pt-2 text-[10px]">
                          その他特記事項：{q.note ?? ""}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                <section className="mt-4">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="border-y border-black">
                        {WORK_STEPS.map((s) => (
                          <th key={s.key} className="py-1">
                            {s.label}
                          </th>
                        ))}
                        <th className="py-1">MEMO</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-black">
                        {WORK_STEPS.map((s) => (
                          <td key={s.key} className="py-3 text-center">
                            {work && work[s.key] ? dateShort(work[s.key] as string) : "／"}
                          </td>
                        ))}
                        <td className="py-3">{work?.note ?? ""}</td>
                      </tr>
                    </tbody>
                  </table>
                  {(work?.reve_color || work?.reve_serial) && (
                    <p className="mt-2 text-[10px]">
                      REVEのシャフト情報　カラー：{work?.reve_color ?? ""}　シリアル番号：{work?.reve_serial ?? ""}
                    </p>
                  )}
                </section>

                <p className="mt-6 text-[10px] text-gray-600">振込先　{ISSUER.bank}</p>
              </>
            )}

            {doc === "quote" && q.note && (
              <section className="mt-6">
                <h2 className="mb-1 text-xs font-bold">備考</h2>
                <p className="whitespace-pre-wrap text-[11px]">{q.note}</p>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SpecSheet({
  customer,
  fitter,
  date,
  due,
  assembledBy,
  orderNo,
  specs,
  items,
}: {
  customer: string;
  fitter: string | null;
  date: string;
  due: string | null;
  assembledBy: string | null;
  orderNo: string | null;
  specs: WorkSpec[];
  items: QuoteItem[];
}) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const rows = specs;

  const th = "border border-black px-1 py-1 text-[10px] font-normal";
  const td = "border border-black px-1 py-2 text-[11px]";

  return (
    <>
      <header className="mb-4 flex items-end justify-between">
        <div>
          <span className="border-b border-black pb-0.5 text-lg">{customer}</span>
          <span className="ml-2 text-sm">様</span>
        </div>
        <table className="text-[11px]">
          <tbody>
            <tr>
              <td className="px-2">フィッティング実施日</td>
              <td className="border-b border-black px-3">{dateShort(date)}</td>
              <td className="px-2">担当フィッター</td>
              <td className="border-b border-black px-3">{fitter ?? ""}</td>
            </tr>
            <tr>
              <td className="px-2">仕上げ期日</td>
              <td className="border-b border-black px-3">{due ? dateShort(due) : ""}</td>
              <td className="px-2">組立担当</td>
              <td className="border-b border-black px-3">{assembledBy ?? ""}</td>
            </tr>
          </tbody>
        </table>
      </header>
      {orderNo && <p className="mb-2 text-[10px] text-gray-600">{orderNo}</p>}

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${th} w-10`}>優先<br />順位</th>
            <th className={`${th} w-36`}>ヘッド</th>
            <th className={th}>シャフト</th>
            <th className={`${th} w-24`}>振動数<br />cpm</th>
            <th className={`${th} w-20`}>バランス</th>
            <th className={`${th} w-24`}>長さ<br />inch</th>
            <th className={`${th} w-24`}>総重量<br />g</th>
            <th className={`${th} w-16`}>ヘッド<br />重量 g</th>
            <th className={`${th} w-12`}>ネジ</th>
            <th className={`${th} w-16`}>グリップ</th>
            <th className={`${th} w-20`}>スリーブ</th>
            <th className={th}>備考</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const it = s.quote_item_id ? itemById.get(s.quote_item_id) : null;
            return (
              <tr key={s.id}>
                <td className={`${td} text-center`}>{s.priority ?? s.line_no}</td>
                <td className={td}>{s.head_name ?? ""}</td>
                <td className={td}>
                  {it ? `${it.manufacturer ?? ""} ${it.product_name}${it.spec ? ` ${it.spec}` : ""}` : ""}
                </td>
                <td className={`${td} text-center`}>
                  {range(s.cpm_min, s.cpm_max)}
                  {s.actual_cpm != null && <div className="text-[10px] text-gray-600">実測 {s.actual_cpm}</div>}
                </td>
                <td className={`${td} text-center`}>
                  {range(s.balance_min, s.balance_max)}
                  {s.actual_balance && <div className="text-[10px] text-gray-600">実測 {s.actual_balance}</div>}
                </td>
                <td className={`${td} text-center`}>
                  {range(s.length_min, s.length_max)}
                  {s.actual_length != null && <div className="text-[10px] text-gray-600">実測 {s.actual_length}</div>}
                </td>
                <td className={`${td} text-center`}>
                  {range(s.weight_min, s.weight_max)}
                  {s.actual_weight != null && <div className="text-[10px] text-gray-600">実測 {s.actual_weight}</div>}
                </td>
                <td className={`${td} text-center`}>
                  {s.head_weight ?? ""}
                  {s.actual_head_weight != null && <div className="text-[10px] text-gray-600">実測 {s.actual_head_weight}</div>}
                </td>
                <td className={`${td} text-center`}>{s.screw ?? ""}</td>
                <td className={`${td} text-center`}>
                  {s.grip_layers ?? ""}
                  {s.grip_wrap ? `／${s.grip_wrap}` : ""}
                </td>
                <td className={`${td} text-center`}>
                  {s.sleeve_source ?? ""}
                  {s.sleeve_position ? `／${s.sleeve_position}` : ""}
                </td>
                <td className={td}>{s.spec_note ?? ""}</td>
              </tr>
            );
          })}
          {Array.from({ length: Math.max(0, 4 - rows.length) }, (_, i) => (
            <tr key={`pad${i}`}>
              {Array.from({ length: 12 }, (_, j) => (
                <td key={j} className={td}>
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
