import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getFitting, getQuote, type QuoteItem, type TrialRow, type WorkOrder, type WorkSpec } from "@/lib/craft";
import { yenPlain } from "@/lib/format";
import { PrintToolbar } from "@/components/print-frame";
import { ColGroup, COVER_COLS, QUOTE_COLS, Letterhead, LETTERHEAD, Money, bd } from "./sheet-parts";

export const dynamic = "force-dynamic";

/**
 * 帳票。00_雛形1.xlsm と 01_試打シャフト表紙.xlsm を、セル単位でそのまま写している。
 *   cover … フィッティング表紙（A4横・A1:N19・拡大98%）対象は表紙のID
 *   quote … 御見積書（A4縦・A1:T45・拡大75%）
 *   order … 御注文書（A4縦・A1:T47・拡大71%）＋仕上げ情報・REVE・進捗欄
 *   spec  … 工房の組立指示書（A4横）※Excelには無い、craft-os で足した紙
 *
 * ★ 紙に無い項目を勝手に足さない。紙にある欄を勝手に消さない。
 *   Excelの明細は「シャフト6行／加工部品3行／グリップ2行／工賃5行」の固定枠なので、
 *   こちらもその枠に流し込む。枠から溢れた行だけは、落とさずシャフト欄の下に足す。
 */

const jpDate = (d: string | null | undefined) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${Number(y)}年${Number(m)}月${Number(dd)}日`;
};

/** Excelの工賃欄は名前が固定。その並びのまま出す */
const LABOR_ROWS = ["クラブ一式組み立て", "グリップ装着", "スリーブ装着", "シャフトカット調整", "その他特別作業"];

type Priced = NonNullable<Awaited<ReturnType<typeof getQuote>>>;

export default async function PrintPage({ params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  if (!["cover", "quote", "order", "spec"].includes(doc)) notFound();
  const actor = await requireActor();

  if (doc === "cover") {
    const cover = await getFitting(actor, Number(id), { withQuotes: false });
    if (!cover) notFound();
    return (
      <>
        <style>{`@page { size: A4 landscape; margin: 10mm; }`}</style>
        <PrintToolbar title="フィッティング表紙" note={`A4横 ／ ${cover.fitting.fitting_no}`} />
        <Sheet landscape>
          <Cover
            customer={cover.fitting.customer_name}
            date={cover.fitting.fitting_date}
            fitter={cover.fitting.fitter_name}
            memberKind={cover.fitting.member_kind}
            menu={cover.fitting.fitting_menu}
            trials={cover.trials}
          />
        </Sheet>
      </>
    );
  }

  const full = await getQuote(actor, Number(id));
  if (!full) notFound();
  const landscape = doc === "spec";
  const title = doc === "quote" ? "御見積書" : doc === "order" ? "御注文書" : "組立指示書";

  return (
    <>
      <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: ${landscape ? "10mm" : "12mm"}; }`}</style>
      <PrintToolbar
        title={title}
        note={`A4${landscape ? "横" : "縦"} ／ ${full.quote.quote_no}${full.work ? ` ／ ${full.work.order_no}` : ""}`}
      />
      <Sheet landscape={landscape}>
        {doc === "spec" ? <SpecSheet full={full} /> : <QuoteSheetPaper full={full} doc={doc as "quote" | "order"} />}
      </Sheet>
    </>
  );
}

/** 紙1枚ぶんの外枠。画面ではA4の見た目、印刷では紙そのもの */
function Sheet({ children, landscape }: { children: React.ReactNode; landscape?: boolean }) {
  return (
    <div
      className="print-sheet mx-auto bg-white p-8 text-black shadow-sm"
      style={{
        maxWidth: landscape ? "297mm" : "210mm",
        fontFamily: '"Meiryo", "メイリオ", "Hiragino Sans", sans-serif',
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 御見積書／御注文書
// ---------------------------------------------------------------------------

function QuoteSheetPaper({ full, doc }: { full: Priced; doc: "quote" | "order" }) {
  const { quote: q, items, priced, work, specs } = full;
  const isOrder = doc === "order";

  const amountOf = (it: QuoteItem) => {
    const i = items.indexOf(it);
    return Number(priced.items[i]?.amount ?? 0);
  };
  const discountOf = (it: QuoteItem) => {
    const i = items.indexOf(it);
    return Number(priced.items[i]?.discountAmount ?? 0);
  };

  const sleeves = items.filter((i) => i.line_kind === "sleeve");
  const coatings = items.filter((i) => i.line_kind === "coating");
  const grips = items.filter((i) => i.line_kind === "grip");
  const labors = items.filter((i) => i.line_kind === "labor");
  const used = new Set([...sleeves, ...coatings, ...grips, ...labors]);
  const goods = items.filter((i) => !used.has(i));

  const goodsRows = Math.max(6, goods.length);
  const shafts = items.filter((i) => i.item_category === "シャフト" && i.finish_length_inch != null);

  const Row = ({
    label,
    labelSpec,
    name,
    nameSpec,
    it,
  }: {
    label?: React.ReactNode;
    labelSpec: string;
    name?: React.ReactNode;
    nameSpec: string;
    it?: QuoteItem;
  }) => (
    <tr style={{ height: "20.1pt" }}>
      <td style={{ ...bd(labelSpec), padding: "1px 3px" }} colSpan={2}>
        {label}
      </td>
      <td style={{ ...bd(nameSpec), padding: "1px 3px" }}>{name}</td>
      <td style={{ ...bd("tb"), padding: "1px 3px" }}>{it?.manufacturer ?? ""}</td>
      <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
        <Money v={it ? Number(it.list_price) : null} />
      </td>
      <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
        <Money v={it ? discountOf(it) : null} />
      </td>
      <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>{it ? it.quantity : ""}</td>
      <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
        <Money v={it ? amountOf(it) : null} />
      </td>
    </tr>
  );

  return (
    <>
      {/* r1 : タイトル（A1:T1・18pt・中央） */}
      <div className="text-center text-[18pt] leading-[30pt] font-normal">{isOrder ? "御注文書" : "御見積書"}</div>

      {/* r3-r13 : 宛名と自社情報 */}
      <div className="mt-2 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-end gap-2" style={{ height: "30pt" }}>
            <div className="min-w-0 flex-1 border-b border-black pb-0.5 text-[14pt]">{q.customer_name}</div>
            <div className="shrink-0 text-[11pt]">様</div>
          </div>
          <div className="mt-1 flex items-end gap-1 text-[10pt]" style={{ height: "26pt" }}>
            <span className="shrink-0">　ご連絡先　：</span>
            <span className="min-w-0 flex-1 border-b border-black pb-0.5">{q.customer_contact ?? ""}</span>
          </div>
          <div className="mt-2 flex items-end gap-1 text-[10pt]">
            <span className="shrink-0">件名：</span>
            <span className="min-w-0 flex-1 border-b border-black pb-0.5">{q.subject}</span>
          </div>
          <div className="mt-1 text-[10pt]">　下記のとおり、御見積もり申し上げます。</div>
          <table className="mt-3 w-full text-[10pt]">
            <tbody>
              <tr style={{ height: "20.1pt" }}>
                <td className="w-[72px] align-bottom">納期：</td>
                <td className="border-b border-black align-bottom">
                  {isOrder && work?.due_date ? jpDate(work.due_date) : q.delivery_note}
                </td>
              </tr>
              <tr style={{ height: "20.1pt" }}>
                <td className="align-bottom">支払条件：</td>
                <td className="border-b border-black align-bottom">{q.payment_terms}</td>
              </tr>
              <tr style={{ height: "20.1pt" }}>
                <td className="align-bottom">有効期限：</td>
                <td className="border-b border-black align-bottom">{q.validity_note}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="w-[240px] shrink-0">
          <div className="mb-2 flex justify-end gap-3 text-[10pt]">
            <span>{isOrder ? "注文日" : "見積日"}</span>
            <span>{jpDate(isOrder ? (work?.order_date ?? q.quote_date) : q.quote_date)}</span>
          </div>
          <Letterhead staffName={q.staff_name ?? ""} />
        </div>
      </div>

      {/* r15 : 合計金額 */}
      <div className="mt-4 flex items-end gap-4 border-b border-black pb-1" style={{ height: "30pt" }}>
        <span className="text-[14pt] font-bold">合計金額</span>
        <span className="text-[14pt] font-bold">¥{yenPlain(priced.totals.total)}</span>
        <span className="text-[11pt]">（税込）</span>
      </div>

      {/* r17-r35 : 明細 */}
      <table className="mt-3 w-full border-collapse text-[10pt]">
        <ColGroup cols={QUOTE_COLS} />
        <thead>
          <tr style={{ height: "30pt" }}>
            <th style={{ ...bd("tblr"), padding: "1px 2px", fontSize: "8pt", fontWeight: 700 }}>
              試打
              <br />
              NO.
            </th>
            <th style={{ ...bd("tblr"), padding: "1px 2px", fontSize: "9pt", fontWeight: 700 }}>種類</th>
            <th style={{ ...bd("tblr"), padding: "1px 2px", fontSize: "11pt", fontWeight: 700 }}>商品名</th>
            <th style={{ ...bd("tblr"), padding: "1px 2px", fontSize: "11pt", fontWeight: 700 }}>メーカー名</th>
            <th style={{ ...bd("tblr"), padding: "1px 2px", fontSize: "11pt", fontWeight: 700 }}>定価</th>
            <th style={{ ...bd("tblr"), padding: "1px 2px", fontSize: "11pt", fontWeight: 700 }}>割引額</th>
            <th style={{ ...bd("tblr"), padding: "1px 2px", fontSize: "11pt", fontWeight: 700 }}>数量</th>
            <th style={{ ...bd("tblr"), padding: "1px 2px", fontSize: "11pt", fontWeight: 700 }}>金額</th>
          </tr>
        </thead>
        <tbody>
          {/* シャフトなどの商品行（Excel r18-r23＝6行。溢れたら落とさず足す） */}
          {Array.from({ length: goodsRows }, (_, i) => {
            const it = goods[i];
            return (
              <tr key={`g${i}`} style={{ height: "24.95pt" }}>
                <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "center" }}>{it?.demo_no ?? ""}</td>
                <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "center", fontSize: "9pt" }}>
                  {it?.club_type ?? ""}
                </td>
                <td style={{ ...bd("tblr"), padding: "1px 3px" }}>
                  {it ? `${it.product_name}${it.spec ? ` ${it.spec}` : ""}` : ""}
                </td>
                <td style={{ ...bd("tblr"), padding: "1px 3px" }}>{it?.manufacturer ?? ""}</td>
                <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
                  <Money v={it ? Number(it.list_price) : null} />
                </td>
                <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
                  <Money v={it ? discountOf(it) : null} />
                </td>
                <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>{it ? it.quantity : ""}</td>
                <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
                  <Money v={it ? amountOf(it) : null} />
                </td>
              </tr>
            );
          })}

          {/* 加工部品（Excel r25-r28） */}
          <Row label="加工部品" labelSpec="tbl" nameSpec="tb" name="" />
          <Row
            label={<span className="pl-2">スリーブ</span>}
            labelSpec="tbl"
            nameSpec="tb"
            name={sleeves[0] ? `${sleeves[0].product_name}${sleeves[0].spec ? ` ${sleeves[0].spec}` : ""}` : ""}
            it={sleeves[0]}
          />
          <Row
            label={<span className="pl-2">ハドラスコーティング</span>}
            labelSpec="tbl"
            nameSpec="tb"
            name={coatings[0] ? coatings[0].product_name : ""}
            it={coatings[0]}
          />
          <Row
            label=""
            labelSpec="tbl"
            nameSpec="tb"
            name={coatings[1] ? coatings[1].product_name : sleeves[1] ? sleeves[1].product_name : ""}
            it={coatings[1] ?? sleeves[1]}
          />

          {/* グリップ（Excel r29-r30） */}
          {[0, 1].map((i) => (
            <Row
              key={`gr${i}`}
              label={i === 0 ? "グリップ" : ""}
              labelSpec="tbl"
              nameSpec="tb"
              name={grips[i] ? `${grips[i].product_name}${grips[i].spec ? ` ${grips[i].spec}` : ""}` : ""}
              it={grips[i]}
            />
          ))}

          {/* 工賃（Excel r31-r35・名前は固定） */}
          {LABOR_ROWS.map((name, i) => {
            const it = labors.find((l) => l.product_name === name);
            return <Row key={`lb${i}`} label={i === 0 ? "工賃" : ""} labelSpec="tbl" nameSpec="tb" name={name} it={it} />;
          })}
          {/* 固定枠に無い工賃は落とさずに足す */}
          {labors
            .filter((l) => !LABOR_ROWS.includes(l.product_name))
            .map((it) => (
              <Row key={`lbx${it.id}`} label="" labelSpec="tbl" nameSpec="tb" name={it.product_name} it={it} />
            ))}
        </tbody>
      </table>

      {/* r36-r39 : 仕上げ長さ と 合計 */}
      <table className="w-full border-collapse text-[10pt]">
        <ColGroup cols={QUOTE_COLS} />
        <tbody>
          <tr style={{ height: "20.1pt" }}>
            <td rowSpan={3} style={{ ...bd("bl"), padding: "1px 3px", verticalAlign: "top" }} colSpan={2}>
              仕上げ長さ
            </td>
            <td style={{ ...bd("b"), padding: "1px 3px" }}>
              {shafts[0]?.finish_length_inch != null ? `${shafts[0].finish_length_inch}　inch` : "　inch"}
            </td>
            <td style={{ padding: "1px 3px", textAlign: "right" }}>小計</td>
            <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
              {isOrder ? <Money v={items.reduce((a, i2) => a + Number(i2.list_price) * Number(i2.quantity ?? 1), 0)} /> : ""}
            </td>
            <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
              {isOrder ? <Money v={items.reduce((a, i2) => a + discountOf(i2), 0)} /> : ""}
            </td>
            <td style={{ ...bd("tblr"), padding: "1px 3px" }}></td>
            <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
              <Money v={priced.totals.subtotal} />
            </td>
          </tr>
          <tr style={{ height: "20.1pt" }}>
            <td style={{ ...bd("b"), padding: "1px 3px" }}>
              {shafts[1]?.finish_length_inch != null ? `${shafts[1].finish_length_inch}　inch` : "　inch"}
            </td>
            <td style={{ padding: "1px 3px", textAlign: "right" }}>消費税</td>
            <td colSpan={3} style={{ padding: "1px 3px" }}></td>
            <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
              <Money v={priced.totals.tax} />
            </td>
          </tr>
          <tr style={{ height: "20.1pt" }}>
            <td style={{ ...bd("b"), padding: "1px 3px" }}>
              {shafts[2]?.finish_length_inch != null ? `${shafts[2].finish_length_inch}　inch` : "　inch"}
            </td>
            <td style={{ padding: "1px 3px", textAlign: "right" }}>{isOrder ? "前受金" : "税別品"}</td>
            <td colSpan={3} style={{ padding: "1px 3px" }}></td>
            <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>
              <Money v={isOrder ? priced.totals.prepaid : priced.totals.taxFree} />
            </td>
          </tr>
          {priced.totals.refund > 0 && (
            <tr style={{ height: "20.1pt" }}>
              <td colSpan={3}></td>
              <td style={{ padding: "1px 3px", textAlign: "right" }}>フィッティング料 返金</td>
              <td colSpan={3} style={{ padding: "1px 3px" }}></td>
              <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right" }}>▲{yenPlain(priced.totals.refund)}</td>
            </tr>
          )}
          <tr style={{ height: "20.1pt" }}>
            <td colSpan={3}></td>
            <td style={{ padding: "1px 3px", textAlign: "right" }}>合計</td>
            <td colSpan={3} style={{ padding: "1px 3px" }}></td>
            <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "right", fontWeight: 700 }}>
              {yenPlain(priced.totals.total)}
            </td>
          </tr>
        </tbody>
      </table>

      {isOrder && <OrderExtras work={work} specs={specs} note={q.note} />}

      {/* r41-r45 : 備考 */}
      {!isOrder && (
        <table className="mt-3 w-full border-collapse text-[10pt]">
          <ColGroup cols={QUOTE_COLS} />
          <tbody>
            <tr style={{ height: "80pt" }}>
              <td colSpan={2} style={{ ...bd("tblr"), padding: "3px", verticalAlign: "top", textAlign: "center" }}>
                備考
              </td>
              <td colSpan={6} style={{ ...bd("tblr"), padding: "3px", verticalAlign: "top", whiteSpace: "pre-wrap" }}>
                {q.note ?? ""}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  );
}

/** 注文書だけにある欄：仕上げ情報・REVE・進捗・備考（Excel r38-r47） */
function OrderExtras({
  work,
  specs,
  note,
}: {
  work: WorkOrder | null;
  specs: WorkSpec[];
  note: string | null;
}) {
  const s = specs[0];
  const range = (a: unknown, b: unknown, unit = "") => {
    const x = a == null || a === "" ? "" : String(a);
    const y = b == null || b === "" ? "" : String(b);
    if (!x && !y) return "";
    if (x && y) return x === y ? `${x}${unit}` : `${x} 〜 ${y}${unit}`;
    return `${x || y}${unit}`;
  };
  const STEPS: { key: keyof WorkOrder; label: string }[] = [
    { key: "ordered_on", label: "発注" },
    { key: "arrived_on", label: "到着" },
    { key: "assembled_on", label: "組立" },
    { key: "reve_sent_on", label: "REVE送信" },
    { key: "delivered_on", label: "お渡し" },
    { key: "td_on", label: "TD" },
    { key: "paid_on", label: "お支払い" },
  ];
  const md = (v: unknown) => {
    if (!v) return "／";
    const [, m, d] = String(v).split("-");
    return `${Number(m)}／${Number(d)}`;
  };

  return (
    <>
      <table className="mt-3 w-full border-collapse text-[9.5pt]">
        <tbody>
          <tr>
            <td
              rowSpan={6}
              style={{ ...bd("tblr"), width: "10%", padding: "2px", textAlign: "center", verticalAlign: "middle" }}
            >
              仕上げ
              <br />
              情報
            </td>
            <td style={{ ...bd("tblr"), width: "16%", padding: "2px 4px" }}>装着ヘッド</td>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>{s?.head_name ?? ""}</td>
            <td style={{ ...bd("tblr"), width: "22%", padding: "2px 4px" }}>REVEのシャフト情報</td>
            <td style={{ ...bd("tblr"), width: "14%", padding: "2px 4px" }}>カラー</td>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>{work?.reve_color ?? ""}</td>
          </tr>
          <tr>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>バランス</td>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>
              {s?.actual_balance ?? range(s?.balance_min, s?.balance_max)}
            </td>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}></td>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>シリアル番号</td>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>{work?.reve_serial ?? ""}</td>
          </tr>
          <tr>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>振動数</td>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>{s?.actual_cpm ?? range(s?.cpm_min, s?.cpm_max)}</td>
            <td colSpan={3} style={{ ...bd("tblr"), padding: "2px 4px" }}></td>
          </tr>
          <tr>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>総重量</td>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>{s?.actual_weight ?? range(s?.weight_min, s?.weight_max)}</td>
            <td colSpan={3} style={{ ...bd("tblr"), padding: "2px 4px" }}></td>
          </tr>
          <tr>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>仕上げ長さ</td>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>{s?.actual_length ?? range(s?.length_min, s?.length_max)}</td>
            <td colSpan={3} style={{ ...bd("tblr"), padding: "2px 4px" }}></td>
          </tr>
          <tr>
            <td style={{ ...bd("tblr"), padding: "2px 4px" }}>その他特記事項</td>
            <td colSpan={4} style={{ ...bd("tblr"), padding: "2px 4px" }}>{s?.spec_note ?? ""}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-3 w-full border-collapse text-[9.5pt]">
        <tbody>
          <tr>
            <td
              rowSpan={2}
              style={{ ...bd("tblr"), width: "10%", padding: "2px", textAlign: "center", verticalAlign: "middle" }}
            >
              備考
            </td>
            {STEPS.map((st) => (
              <td key={st.key as string} style={{ ...bd("tblr"), padding: "2px 4px", textAlign: "center" }}>
                {st.label}
              </td>
            ))}
            <td style={{ ...bd("tblr"), width: "22%", padding: "2px 4px", textAlign: "center" }}>MEMO</td>
          </tr>
          <tr>
            {STEPS.map((st) => (
              <td key={`v${st.key as string}`} style={{ ...bd("tblr"), padding: "6px 4px", textAlign: "center" }}>
                {md(work?.[st.key])}
              </td>
            ))}
            <td style={{ ...bd("tblr"), padding: "6px 4px", verticalAlign: "top", whiteSpace: "pre-wrap" }}>
              {note ?? work?.note ?? ""}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 text-[9pt]">
        振込先　{LETTERHEAD.bank}　{LETTERHEAD.bankName}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// フィッティング表紙（A4横）
// ---------------------------------------------------------------------------

function Cover({
  customer,
  date,
  fitter,
  memberKind,
  menu,
  trials,
}: {
  customer: string;
  date: string;
  fitter: string | null;
  memberKind: string;
  menu: string | null;
  trials: TrialRow[];
}) {
  /** Excelは丸で囲む欄。該当するものに丸をつける */
  const Pick = ({ label, on }: { label: string; on: boolean }) => (
    <span
      className={on ? "mx-2 inline-block rounded-full border-2 border-black px-3 py-0.5" : "mx-2 inline-block px-3 py-0.5"}
    >
      {label}
    </span>
  );
  const rows = Array.from({ length: 11 }, (_, i) => trials.find((t) => t.line_no === i + 1));

  return (
    <>
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-end gap-2" style={{ height: "34.9pt" }}>
            <div className="min-w-0 flex-1 border-b border-black pb-0.5 text-center text-[18pt]">{customer}</div>
            <div className="shrink-0 text-[14pt]">様</div>
          </div>
          <div className="mt-3 text-[11pt]">
            <Pick label="会員" on={memberKind === "会員"} />
            <Pick label="ビジター" on={memberKind === "ビジター"} />
          </div>
          <div className="mt-2 text-[11pt]">
            <Pick label="シャフトフルフィッテイング" on={menu === "シャフトフルフィッティング"} />
            <Pick label="シャフトフィッテイング" on={menu === "シャフトフィッティング"} />
            <Pick label="ボールフィッティング" on={menu === "ボールフィッティング"} />
          </div>
        </div>
        <div className="w-[260px] shrink-0 text-[11pt]">
          <div className="flex justify-between gap-2">
            <span>フィッティング実施日</span>
            <span className="border-b border-black px-2">{jpDate(date)}</span>
          </div>
          <div className="mt-3 flex justify-between gap-2">
            <span>担当フィッター</span>
            <span className="border-b border-black px-2">{fitter ?? ""}</span>
          </div>
        </div>
      </div>

      <table className="mt-5 w-full border-collapse text-[11pt]">
        <ColGroup cols={COVER_COLS} />
        <thead>
          <tr style={{ height: "41.25pt" }}>
            <th style={{ ...bd("tbl") }}></th>
            <th style={{ ...bd("tbl") }}></th>
            <th style={{ ...bd("tblr"), fontSize: "11pt", fontWeight: 400 }}>試打NO</th>
            <th style={{ ...bd("tblr"), fontSize: "12pt", fontWeight: 400 }}>シャフト名</th>
            <th style={{ ...bd("tblr"), fontSize: "12pt", fontWeight: 400 }}>メーカー名</th>
            <th style={{ ...bd("tblr"), fontSize: "12pt", fontWeight: 400 }}>定価</th>
            <th style={{ ...bd("tblr"), fontSize: "12pt", fontWeight: 400 }}>memo</th>
            <th style={{ ...bd("tbr") }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={i} style={{ height: "25.9pt" }}>
              <td style={{ ...bd("tbl") }}></td>
              <td style={{ ...bd("tbl"), padding: "1px 3px", textAlign: "center" }}>{i + 1}</td>
              <td style={{ ...bd("tblr"), padding: "1px 3px", textAlign: "center" }}>{t?.demo_no ?? ""}</td>
              <td style={{ ...bd("tblr"), padding: "1px 4px" }}>
                {t?.product ? `${t.product.name}${t.product.spec ? ` ${t.product.spec}` : ""}` : ""}
              </td>
              <td style={{ ...bd("tblr"), padding: "1px 4px" }}>{t?.product?.manufacturer ?? ""}</td>
              <td style={{ ...bd("tblr"), padding: "1px 4px", textAlign: "right" }}>
                <Money v={t?.product?.list_price ?? null} />
              </td>
              <td style={{ ...bd("tblr"), padding: "1px 4px" }}>{t?.memo ?? ""}</td>
              <td style={{ ...bd("tbr") }}></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
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
