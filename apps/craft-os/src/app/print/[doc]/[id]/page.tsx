import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { FITTING_MENUS, getFitting, getQuote, type TrialRow } from "@/lib/craft";
import Link from "next/link";
import { PrintToolbar } from "@/components/print-frame";
import { acceptOrder } from "@/app/q/[id]/flow-actions";
import {
  Check,
  CoverPaper,
  jpDate,
  md,
  Money,
  ORDER_STEPS,
  OrderBottom,
  PaperSheet,
  QuoteBottom,
  QuotePaper,
  sumsOf,
  toPaperItems,
  MENU_LABELS,
} from "@/components/paper";
import { finishInfoOf } from "@/lib/paper-data";
import { ThanksLetter } from "@/components/thanks-letter";

export const dynamic = "force-dynamic";

/**
 * 帳票。店の Excel（00_雛形1.xlsm / 01_試打シャフト表紙.xlsm）を PDF にしたものが正典。
 *   cover … Fitting Report（試打シャフト表紙・A4横）対象は表紙のID
 *   quote … 御見積書（A4縦）
 *   order … 御注文書（A4縦）＋仕上げ情報・REVE・進捗欄
 *   spec  … 工房の組立指示書（A4横）※Excelには無い、craft-os で足した紙
 *
 * 紙の部品は components/paper.tsx。編集画面（/q/[id]/quote・/q/[id]/work・/f/[id]）も同じ部品を使うので、
 * 画面で見えている形がそのまま印刷される。
 */

const NEXT_GHOST =
  "inline-flex items-center gap-1 rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm font-medium hover:bg-(--color-panel-2)";
const NEXT_MAIN =
  "inline-flex items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700";

/**
 * 印刷のあとに進む先（ツールバーと、印刷ダイアログを閉じたあとの案内に出る）。
 *   御見積書 → 見積の画面に戻る ／ ご注文いただいた → 注文書へ（注文書が無ければ作る）
 *   御注文書 → 注文書の画面に戻る ／ 見積の画面へ
 *   組立指示書 → 注文書・工房の画面に戻る
 */
function NextSteps({ doc, id, hasOrder }: { doc: string; id: number; hasOrder: boolean }) {
  if (doc === "quote") {
    return (
      <>
        <Link href={`/q/${id}/quote`} className={NEXT_GHOST}>
          ← 見積の画面に戻る
        </Link>
        {hasOrder ? (
          <Link href={`/q/${id}/work`} className={NEXT_MAIN}>
            注文書へ進む →
          </Link>
        ) : (
          <form action={acceptOrder}>
            <input type="hidden" name="quote_id" value={id} />
            <input type="hidden" name="then" value="work" />
            <button className={NEXT_MAIN}>ご注文いただいた → 注文書へ進む</button>
          </form>
        )}
      </>
    );
  }
  if (doc === "order") {
    return (
      <>
        <Link href={`/q/${id}/quote`} className={NEXT_GHOST}>
          ← 見積の画面へ
        </Link>
        <Link href={`/q/${id}/work`} className={NEXT_MAIN}>
          注文書の画面に戻る（お支払い・発注）
        </Link>
      </>
    );
  }
  return (
    <Link href={`/q/${id}/work`} className={NEXT_GHOST}>
      ← 注文書・工房の画面に戻る
    </Link>
  );
}

type Priced = NonNullable<Awaited<ReturnType<typeof getQuote>>>;

export default async function PrintPage({ params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  if (!["cover", "quote", "order", "spec", "thanks"].includes(doc)) notFound();
  const actor = await requireActor();

  if (doc === "cover") {
    const cover = await getFitting(actor, Number(id), { withQuotes: false });
    if (!cover) notFound();
    const f = cover.fitting;
    return (
      <>
        <style>{`@page { size: A4 landscape; margin: 8mm; }`}</style>
        <PrintToolbar
          title="Fitting Report（試打シャフト表紙）"
          note={`A4横 ／ ${f.fitting_no}`}
          next={
            <Link href={`/f/${f.id}`} className={NEXT_GHOST}>
              ← 表紙の画面に戻る
            </Link>
          }
        />
        <PaperSheet landscape>
          <CoverPaper
            customer={f.customer_name}
            date={jpDate(f.fitting_date)}
            fitter={f.fitter_name ?? ""}
            kindPicker={
              <>
                <Check on={f.member_kind === "会員"} label="会員" />
                <Check on={f.member_kind !== "会員"} label="ビジター" />
              </>
            }
            menuPicker={FITTING_MENUS.map((m) => (
              <Check key={m} on={f.fitting_menu === m} label={MENU_LABELS[m]} />
            ))}
            rows={coverRows(cover.trials)}
          />
        </PaperSheet>
      </>
    );
  }

  const full = await getQuote(actor, Number(id));
  if (!full) notFound();
  const landscape = doc === "spec";
  const title = doc === "quote" ? "御見積書" : doc === "order" ? "御注文書" : doc === "thanks" ? "お礼状" : "組立指示書";

  return (
    <>
      <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: ${landscape ? "10mm" : "9mm"}; }`}</style>
      <PrintToolbar
        title={title}
        note={`A4${landscape ? "横" : "縦"} ／ ${full.quote.quote_no}${full.work ? ` ／ ${full.work.order_no}` : ""}`}
        next={<NextSteps doc={doc} id={full.quote.id} hasOrder={Boolean(full.work)} />}
      />
      <PaperSheet landscape={landscape}>
        {doc === "spec" ? (
          <SpecSheet full={full} />
        ) : doc === "thanks" ? (
          <ThanksLetter full={full} />
        ) : (
          <QuoteDoc full={full} doc={doc as "quote" | "order"} />
        )}
      </PaperSheet>
    </>
  );
}

/** 表紙の行（試打した順）。定価は商品マスタの今の値 */
function coverRows(trials: TrialRow[]) {
  // 行の位置（line_no）は紙の番号なので詰めない。最後に書いた行までを出す（最低10行は紙の側で埋まる）
  let last = -1;
  trials.forEach((t, i) => {
    if (t.demo_no != null || t.memo) last = i;
  });
  return trials
    .slice(0, last + 1)
    .map((t) => ({
      key: t.id,
      lineNo: t.line_no,
      demoNo: t.demo_no ?? "",
      name: t.product ? `${t.product.name}${t.product.spec ? ` ${t.product.spec}` : ""}` : (t.demoNote ?? ""),
      maker: t.product?.manufacturer ?? "",
      price: <Money v={t.product?.list_price ?? null} />,
      memo: t.memo ?? "",
    }));
}

function QuoteDoc({ full, doc }: { full: Priced; doc: "quote" | "order" }) {
  const { quote: q, work, priced } = full;
  const items = toPaperItems(full.items, priced.items);
  const isOrder = doc === "order";
  const t = priced.totals;
  const refundRow = t.refund > 0 ? [{ label: "返金", value: <>▲¥{t.refund.toLocaleString("ja-JP")}</> }] : [];
  const shafts = items.filter((i) => i.category === "シャフト");
  const finish = [0, 1, 2].map((i) => (shafts[i]?.finishInch != null ? String(shafts[i].finishInch) : ""));
  for (let i = 3; i < shafts.length; i++) finish.push(shafts[i].finishInch != null ? String(shafts[i].finishInch) : "");

  return (
    <QuotePaper
      doc={doc}
      customerName={q.customer_name}
      contact={q.customer_contact ?? ""}
      date={jpDate(isOrder ? (work?.order_date ?? q.quote_date) : q.quote_date)}
      subject={q.subject}
      delivery={isOrder && work?.due_date ? jpDate(work.due_date) : q.delivery_note}
      payment={q.payment_terms}
      validity={q.validity_note}
      staffName={q.staff_name ?? ""}
      total={t.total}
      items={items}
      bottom={
        isOrder ? (
          <OrderBottom
            info={finishInfoOf(full)}
            totals={[
              { label: "小計", value: <Money v={t.subtotal} zero />, sums: sumsOf(items) },
              { label: "消費税", value: <Money v={t.tax} zero /> },
              ...refundRow,
              { label: "前受金", value: <Money v={t.prepaid} zero /> },
              { label: "合計", value: <Money v={t.total} zero />, strong: true },
            ]}
            reveColor={work?.reve_color ?? ""}
            reveSerial={work?.reve_serial ?? ""}
            steps={ORDER_STEPS.map((s) => ({ label: s.label, value: md(work?.[s.key] ?? null) }))}
            memo={[q.note, work?.note].filter(Boolean).join("\n")}
          />
        ) : (
          <QuoteBottom
            finish={finish}
            totals={[
              { label: "小計", value: <Money v={t.subtotal} zero />, sums: sumsOf(items) },
              { label: "消費税", value: <Money v={t.tax} zero /> },
              { label: "税別品", value: <Money v={t.taxFree} /> },
              ...refundRow,
              { label: "合計", value: <Money v={t.total} zero />, strong: true },
            ]}
            note={q.note ?? ""}
          />
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// 組立指示書（Excelには無い。craft-os で足した紙）
// ---------------------------------------------------------------------------

function SpecSheet({ full }: { full: Priced }) {
  const { quote: q, items, work, specs } = full;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const th = "border border-black px-1 py-1 text-[9pt] font-normal";
  const td = "border border-black px-1 py-2 text-[10pt]";
  const range = (a: unknown, b: unknown) => {
    const x = a == null || a === "" ? "" : String(a);
    const y = b == null || b === "" ? "" : String(b);
    if (!x && !y) return "";
    return x && y ? (x === y ? x : `${x} 〜 ${y}`) : x || y;
  };

  return (
    <>
      <header className="mb-4 flex items-end justify-between">
        <div>
          <span className="border-b border-black pb-0.5 text-[16pt]">{q.customer_name}</span>
          <span className="ml-2 text-[12pt]">様</span>
        </div>
        <table className="text-[10pt]">
          <tbody>
            <tr>
              <td className="px-2">仕上げ期日</td>
              <td className="border-b border-black px-3">{work?.due_date ?? ""}</td>
              <td className="px-2">組立担当</td>
              <td className="border-b border-black px-3">{work?.assembled_by_name ?? ""}</td>
            </tr>
          </tbody>
        </table>
      </header>
      {work && <p className="mb-2 text-[9pt] text-gray-600">{work.order_no}</p>}

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${th} w-10`}>
              優先
              <br />
              順位
            </th>
            <th className={`${th} w-36`}>ヘッド</th>
            <th className={th}>シャフト</th>
            <th className={`${th} w-24`}>
              振動数
              <br />
              cpm
            </th>
            <th className={`${th} w-20`}>バランス</th>
            <th className={`${th} w-24`}>
              長さ
              <br />
              inch
            </th>
            <th className={`${th} w-24`}>
              総重量
              <br />g
            </th>
            <th className={`${th} w-16`}>
              ヘッド
              <br />
              重量 g
            </th>
            <th className={`${th} w-12`}>ネジ</th>
            <th className={`${th} w-16`}>グリップ</th>
            <th className={`${th} w-20`}>スリーブ</th>
            <th className={th}>備考</th>
          </tr>
        </thead>
        <tbody>
          {specs.map((s) => {
            const it = s.quote_item_id ? itemById.get(s.quote_item_id) : null;
            return (
              <tr key={s.id}>
                <td className={`${td} text-center`}>{s.priority ?? s.line_no}</td>
                <td className={td}>{s.head_name ?? ""}</td>
                <td className={td}>{it ? `${it.manufacturer ?? ""} ${it.product_name}${it.spec ? ` ${it.spec}` : ""}` : ""}</td>
                <td className={`${td} text-center`}>
                  {range(s.cpm_min, s.cpm_max)}
                  {s.actual_cpm != null && <div className="text-[8pt] text-gray-600">実測 {s.actual_cpm}</div>}
                </td>
                <td className={`${td} text-center`}>
                  {range(s.balance_min, s.balance_max)}
                  {s.actual_balance && <div className="text-[8pt] text-gray-600">実測 {s.actual_balance}</div>}
                </td>
                <td className={`${td} text-center`}>
                  {range(s.length_min, s.length_max)}
                  {s.actual_length != null && <div className="text-[8pt] text-gray-600">実測 {s.actual_length}</div>}
                </td>
                <td className={`${td} text-center`}>
                  {range(s.weight_min, s.weight_max)}
                  {s.actual_weight != null && <div className="text-[8pt] text-gray-600">実測 {s.actual_weight}</div>}
                </td>
                <td className={`${td} text-center`}>
                  {s.head_weight ?? ""}
                  {s.actual_head_weight != null && <div className="text-[8pt] text-gray-600">実測 {s.actual_head_weight}</div>}
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
          {Array.from({ length: Math.max(0, 4 - specs.length) }, (_, i) => (
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

