import type { CSSProperties, ReactNode } from "react";
import { yenPlain } from "@/lib/format";

/**
 * 紙の帳票（御見積書・御注文書・Fitting Report）。
 *
 * 画面（編集）と印刷の両方がこの1つを使う。2026-09-18 ユーザー指摘
 * 「見積・注文書・試打シャフト表紙の画面が、渡した PDF の形になっていない」への対応で、
 * 編集画面を別デザインで作るのをやめ、紙そのものの上で直す形に揃えた。
 *
 * 正典は店の Excel（00_雛形1.xlsm / 01_試打シャフト表紙.xlsm）を PDF にしたもの:
 *   ・見出しセルは水色（#DAEEF3）、「割引額」だけ赤字
 *   ・明細は「商品6行／加工部品4行／グリップ2行／工賃5行」の固定枠。溢れた行は落とさず足す
 *   ・注文書は左に「仕上げ情報」（赤枠）、右に合計、その下に REVE のシャフト情報（赤枠）
 *   ・表紙は A4 横。オレンジの帯に「Fitting Report」とロゴ、下にグレーの店舗帯
 *
 * ★ このファイルは hooks を使わない（サーバーの印刷ページとクライアントの編集画面の両方から読む）。
 * ★ 紙に無い項目を勝手に足さない。紙にある欄を勝手に消さない。
 */

export const PAPER = {
  head: "#DAEEF3",
  red: "#E00000",
  orange: "#E3852E",
  coverHead: "#D6DCE4",
  footer: "#828282",
} as const;

export const PAPER_FONT = '"Meiryo", "メイリオ", "Hiragino Sans", "Noto Sans JP", sans-serif';

/** 会社の連絡先（Excel M10:M12）。振込先は注文書の下にだけ出す */
export const LETTERHEAD = {
  zip: "〒665-0882",
  address: "兵庫県宝塚市山本南１－２６－２５",
  tel: "TEL／FAX　：　0797-82-0833",
  bank: "三菱UFJ銀行　信濃橋支店　（普通）0235311",
  bankName: "口座名義　株式会社ファイン",
  storeLine: "ゴルフウイング 宝塚店　TEL.0797-82-0833　〒665-0882 兵庫県宝塚市山本南1-26-25　https://www.golfwing.jp",
};

/** 見積書・注文書の列（Excel A〜T の列幅をそのまま比率に） */
export const QUOTE_COLS = [
  { key: "A", w: 7.125 },
  { key: "B", w: 5.625 },
  { key: "CtoG", w: 8.38 * 4 + 17.625 },
  { key: "HtoI", w: 5.625 + 14.125 },
  { key: "JtoL", w: 4.125 + 8.38 * 2 },
  { key: "MtoO", w: 8.38 * 3 },
  { key: "PtoQ", w: 4.625 + 8.38 },
  { key: "RtoT", w: 4.125 + 8.38 * 2 },
];

/** 表紙（A4横）の列: 行番号・試打NO・シャフト名・メーカー名・定価・memo */
export const COVER_COLS = [
  { key: "no", w: 5.5 },
  { key: "demo", w: 11 },
  { key: "name", w: 38 },
  { key: "maker", w: 23.5 },
  { key: "price", w: 13.8 },
  { key: "memo", w: 20.7 },
];

export function ColGroup({ cols }: { cols: { key: string; w: number }[] }) {
  const total = cols.reduce((a, c) => a + c.w, 0);
  return (
    <colgroup>
      {cols.map((c) => (
        <col key={c.key} style={{ width: `${(c.w / total) * 100}%` }} />
      ))}
    </colgroup>
  );
}

/** Excel の罫線。t/b/l/r を指定した辺だけ引く */
export function bd(spec: string, color = "#000"): CSSProperties {
  const has = (ch: string) => spec.includes(ch);
  const line = `1px solid ${color}`;
  return {
    borderTop: has("t") ? line : undefined,
    borderBottom: has("b") ? line : undefined,
    borderLeft: has("l") ? line : undefined,
    borderRight: has("r") ? line : undefined,
  };
}

/** 金額セル。Excel の書式は ¥#,##0。0 や空は空欄のまま */
export function Money({ v, zero = false }: { v: number | null | undefined; zero?: boolean }) {
  if (v == null) return <>{""}</>;
  if (v === 0 && !zero) return <>{""}</>;
  return <>¥{yenPlain(v)}</>;
}

export const jpDate = (d: string | null | undefined) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${Number(y)}年${Number(m)}月${Number(dd)}日`;
};

/** 紙1枚ぶんの外枠。画面では A4 の見た目、印刷では紙そのもの */
export function PaperSheet({
  children,
  landscape,
  className = "",
}: {
  children: ReactNode;
  landscape?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`print-sheet mx-auto bg-white text-black shadow-sm ${landscape ? "p-6" : "p-8"} ${className}`}
      style={{ maxWidth: landscape ? "297mm" : "210mm", fontFamily: PAPER_FONT, color: "#000" }}
    >
      {children}
    </div>
  );
}

export function Letterhead({ staffName }: { staffName: ReactNode }) {
  return (
    <div className="text-[10pt] leading-[1.75]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/golfwing-logo.png" alt="GOLF WING BIG DISTANCE" className="mb-1 h-[50px] w-auto" />
      <div>{LETTERHEAD.zip}</div>
      <div>{LETTERHEAD.address}</div>
      <div>{LETTERHEAD.tel}</div>
      <div className="mt-0.5 flex gap-6 pl-3">
        <span>担当：</span>
        <span className="min-w-[6em]">{staffName}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 御見積書／御注文書
// ---------------------------------------------------------------------------

/** 紙の1行ぶんのデータ。印刷（DBの明細）と編集画面（SheetRow）の両方から作る */
export type PaperItem = {
  id: number;
  lineKind: string;
  category: string | null;
  demoNo: number | null;
  kind: string;
  /** 商品名（規格つき） */
  name: string;
  /** 規格を含まない名前（工賃の固定枠との突き合わせ用） */
  productName: string;
  maker: string;
  listPrice: number;
  discount: number;
  qty: number;
  amount: number;
  finishInch: number | null;
};

/** 工賃欄の固定行（Excel r31-r35）。code は gw_labor_rates.code */
export const LABOR_ROWS = [
  { name: "クラブ一式組み立て", code: "assembly_set" },
  { name: "グリップ装着", code: "grip_mount" },
  { name: "スリーブ装着", code: "sleeve_mount" },
  { name: "シャフトカット調整", code: "shaft_cut" },
  { name: "その他特別作業", code: "other_work" },
] as const;

/** 明細を紙の枠に振り分ける */
export function layoutItems(items: PaperItem[]) {
  const sleeves = items.filter((i) => i.lineKind === "sleeve");
  const coatings = items.filter((i) => i.lineKind === "coating");
  const grips = items.filter((i) => i.lineKind === "grip");
  const labors = items.filter((i) => i.lineKind === "labor");
  const used = new Set<PaperItem>([...sleeves, ...coatings, ...grips, ...labors]);
  const goods = items.filter((i) => !used.has(i));
  const fixedLabor = LABOR_ROWS.map((r) => ({ ...r, item: labors.find((l) => l.productName === r.name) }));
  const laborNames: readonly string[] = LABOR_ROWS.map((r) => r.name);
  const extraLabor = labors.filter((l) => !laborNames.includes(l.productName));
  const shafts = goods.filter((i) => i.category === "シャフト");
  return { goods, sleeves, coatings, grips, fixedLabor, extraLabor, shafts };
}

export type PaperSlot = "sleeve" | "coating" | "grip" | "labor";

/**
 * 紙の上に編集の部品を差し込むための口。印刷では渡さない（＝読むだけの紙）。
 *   name     … 商品名セルの右端（✕ など）
 *   discount … 割引額セル（掛け率の選択など）
 *   qty      … 数量セル
 *   empty    … 空いている固定枠（「＋ 入れる」など）
 */
export type PaperEdit = {
  name?: (it: PaperItem) => ReactNode;
  discount?: (it: PaperItem) => ReactNode;
  qty?: (it: PaperItem) => ReactNode;
  empty?: (slot: PaperSlot, laborCode?: string) => ReactNode;
};

const HEAD: CSSProperties = { background: PAPER.head };
/** 列幅は colgroup のとおりに固定（長い文字で列がずれて、上下の表の罫線が揃わなくなるのを防ぐ） */
const FIXED: CSSProperties = { tableLayout: "fixed" };
const cellPad: CSSProperties = { padding: "1px 4px" };

function ItemCells({ it, edit }: { it?: PaperItem; edit?: PaperEdit }) {
  return (
    <>
      <td style={{ ...bd("tblr"), ...cellPad, textAlign: "right" }}>
        <Money v={it ? it.listPrice : null} />
      </td>
      <td style={{ ...bd("tblr"), ...cellPad, textAlign: "right" }}>
        {it && edit?.discount ? edit.discount(it) : <Money v={it ? it.discount : null} />}
      </td>
      <td style={{ ...bd("tblr"), ...cellPad, textAlign: "right" }}>
        {it && edit?.qty ? edit.qty(it) : it ? it.qty : ""}
      </td>
      <td style={{ ...bd("tblr"), ...cellPad, textAlign: "right" }}>
        <Money v={it ? it.amount : null} zero={Boolean(it)} />
      </td>
    </>
  );
}

/** 加工部品・グリップ・工賃の行（左に区分、右に名前） */
function PartRow({
  label,
  indent,
  it,
  fixedName,
  slot,
  laborCode,
  edit,
}: {
  label?: string;
  indent?: boolean;
  it?: PaperItem;
  fixedName?: string;
  slot?: PaperSlot;
  laborCode?: string;
  edit?: PaperEdit;
}) {
  // 区分の文字（ハドラスコーティング など）と重なる部分は名前から外す
  const raw = fixedName ?? (it ? it.name : "");
  const name = label && raw.startsWith(label) && raw !== label ? raw.slice(label.length).trim() : raw;
  return (
    <tr style={{ height: "16.5pt" }}>
      {/* Excel は区分が A〜B、名前が C。区分の文字が長い（ハドラスコーティング）ので、1つのセルの中で区分の幅を取る */}
      <td colSpan={3} style={{ ...bd("tbl"), ...cellPad, paddingLeft: indent ? "12px" : "4px" }}>
        <div className="flex items-center gap-1">
          <span className="shrink-0 whitespace-nowrap" style={{ width: "32%" }}>
            {label ?? ""}
          </span>
          <span
            className="min-w-0 flex-1 truncate"
            title={typeof name === "string" ? name : undefined}
            style={{ fontSize: fixedName ? "8.5pt" : undefined, letterSpacing: fixedName ? "0.08em" : undefined }}
          >
            {name}
            {fixedName && it && it.name !== fixedName ? <span className="ml-1">{it.name.replace(fixedName, "")}</span> : null}
          </span>
          {it && edit?.name ? edit.name(it) : null}
          {!it && slot && edit?.empty ? edit.empty(slot, laborCode) : null}
        </div>
      </td>
      <td style={{ ...bd("tb"), ...cellPad }}>{it?.maker ?? ""}</td>
      <ItemCells it={it} edit={edit} />
    </tr>
  );
}

export type TotalRow = { label: string; value: ReactNode; strong?: boolean; sums?: { list: number; discount: number } };

export function QuotePaper({
  doc,
  customerName,
  contact,
  date,
  subject,
  delivery,
  payment,
  validity,
  staffName,
  total,
  items,
  edit,
  bottom,
  goodsMin = 6,
  onEmptyGoods,
  onEmptyDemo,
}: {
  doc: "quote" | "order";
  customerName: ReactNode;
  contact: ReactNode;
  date: ReactNode;
  subject: ReactNode;
  delivery: ReactNode;
  payment: ReactNode;
  validity: ReactNode;
  staffName: ReactNode;
  total: number;
  items: PaperItem[];
  edit?: PaperEdit;
  /** 明細の下（仕上げ長さ＋合計／仕上げ情報＋合計＋REVE＋進捗） */
  bottom: ReactNode;
  goodsMin?: number;
  /** 空いている商品行に出すもの（編集画面の「＋ 商品」など）。1行目の空きにだけ出る */
  onEmptyGoods?: ReactNode;
  /** 空いている商品行の「試打NO.」欄に出すもの（編集画面の番号入力）。1行目の空きにだけ出る */
  onEmptyDemo?: ReactNode;
}) {
  const isOrder = doc === "order";
  const L = layoutItems(items);
  const goodsRows = Math.max(goodsMin, L.goods.length);
  // 加工部品の3行目は、2つ目のコーティング → 2つ目のスリーブの順で使う（Excel と同じ）
  const partExtra = L.coatings[1] ?? L.sleeves[1];
  const overflowParts = [...L.coatings.slice(2), ...L.sleeves.slice(L.coatings[1] ? 1 : 2), ...L.grips.slice(2)];

  return (
    <div className="text-[10pt]" style={{ fontFamily: PAPER_FONT }}>
      <div className="text-center text-[18pt] leading-[30pt] tracking-[0.1em]">{isOrder ? "御注文書" : "御見積書"}</div>

      {/* 宛名と自社情報 */}
      <div className="mt-2 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-end gap-2" style={{ minHeight: "30pt" }}>
            <div className="min-w-0 flex-1 border-b border-black pb-0.5 text-center text-[14pt] font-bold">{customerName}</div>
            <div className="shrink-0 text-[11pt]">様</div>
          </div>
          <div className="mt-1 flex items-end gap-2 text-[9pt]" style={{ minHeight: "20pt" }}>
            <span className="shrink-0">ご連絡先　：</span>
            <span className="min-w-0 flex-1 pb-0.5">{contact}</span>
          </div>

          <div className="mt-3 flex items-end gap-1 pl-6 text-[11pt] font-bold">
            <span className="shrink-0">件名：</span>
            <span className="min-w-0 flex-1">{subject}</span>
          </div>
          <div className="border-b-[3px] border-double border-black" />
          <div className="mt-1 pl-10 text-[9.5pt]">下記のとおり、御見積もり申し上げます。</div>

          <table className="mt-3 w-full text-[9pt]">
            <tbody>
              {[
                ["納期：", delivery],
                ["支払条件：", payment],
                ["有効期限：", validity],
              ].map(([k, v], i) => (
                <tr key={i} style={{ height: "18pt" }}>
                  <td className="w-[76px] pr-1 text-right align-bottom whitespace-nowrap">{k}</td>
                  <td className="border-b border-black align-bottom">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="w-[235px] shrink-0">
          <div className="mb-1 flex justify-end gap-6 text-[9.5pt]">
            <span>{isOrder ? "注文日" : "見積日"}</span>
            <span>{date}</span>
          </div>
          <Letterhead staffName={staffName} />
        </div>
      </div>

      {/* 合計金額 */}
      <div className="mt-3 flex w-[62%] items-end gap-6 pb-1 pl-6" style={{ borderBottom: "3px double #000" }}>
        <span className="text-[12pt] font-bold">合計金額</span>
        <span className="min-w-[7em] text-center text-[13pt] font-bold">¥{yenPlain(total)}</span>
        <span className="text-[9pt]">（税込）</span>
      </div>

      {/* 明細 */}
      <table className="mt-3 w-full border-collapse text-[9.5pt]" style={FIXED}>
        <ColGroup cols={QUOTE_COLS} />
        <thead>
          <tr style={{ height: "26pt" }}>
            {[
              ["試打\nNO.", "7.5pt"],
              ["種類", "7.5pt"],
              ["商品名", "9.5pt"],
              ["メーカー名", "9.5pt"],
              ["定価", "9.5pt"],
              ["割引額", "9.5pt"],
              ["数量", "9.5pt"],
              ["金額", "9.5pt"],
            ].map(([t, fs]) => (
              <th
                key={t}
                style={{
                  ...bd("tblr"),
                  ...HEAD,
                  padding: "1px 2px",
                  fontSize: fs,
                  fontWeight: 700,
                  whiteSpace: "pre-line",
                  lineHeight: 1.15,
                  color: t === "割引額" ? PAPER.red : undefined,
                }}
              >
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: goodsRows }, (_, i) => {
            const it = L.goods[i];
            return (
              <tr key={`g${i}`} style={{ height: "18pt" }}>
                <td style={{ ...bd("tblr"), padding: it ? "1px 4px" : "0 1px", textAlign: "center" }}>
                  {it ? (it.demoNo ?? "") : i === L.goods.length && onEmptyDemo ? onEmptyDemo : ""}
                </td>
                <td style={{ ...bd("tblr"), ...cellPad, textAlign: "center", fontSize: "8.5pt" }}>{it?.kind ?? ""}</td>
                <td style={{ ...bd("tblr"), ...cellPad }}>
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1">{it?.name ?? ""}</span>
                    {it && edit?.name ? edit.name(it) : null}
                    {!it && i === L.goods.length && onEmptyGoods ? onEmptyGoods : null}
                  </div>
                </td>
                <td style={{ ...bd("tblr"), ...cellPad, fontSize: "9pt" }}>{it?.maker ?? ""}</td>
                <ItemCells it={it} edit={edit} />
              </tr>
            );
          })}
        </tbody>
      </table>

      <table className="mt-2 w-full border-collapse text-[9.5pt]" style={FIXED}>
        <ColGroup cols={QUOTE_COLS} />
        <tbody>
          <PartRow label="加工部品" />
          <PartRow label="スリーブ" indent it={L.sleeves[0]} slot="sleeve" edit={edit} />
          <PartRow label="ハドラスコーティング" indent it={L.coatings[0]} slot="coating" edit={edit} />
          <PartRow it={partExtra} edit={edit} />
          <PartRow label="グリップ" indent it={L.grips[0]} slot="grip" edit={edit} />
          <PartRow it={L.grips[1]} edit={edit} />
          {overflowParts.map((it) => (
            <PartRow key={`op${it.id}`} it={it} edit={edit} />
          ))}
          {L.fixedLabor.map((r, i) => (
            <PartRow
              key={r.code}
              label={i === 0 ? "工賃" : undefined}
              indent
              fixedName={r.name}
              it={r.item}
              slot="labor"
              laborCode={r.code}
              edit={edit}
            />
          ))}
          {L.extraLabor.map((it) => (
            <PartRow key={`lx${it.id}`} it={it} edit={edit} />
          ))}
        </tbody>
      </table>

      {bottom}
    </div>
  );
}

/** 小計の行に出す「定価の合計／割引額の合計」 */
export function sumsOf(items: PaperItem[]) {
  return {
    list: items.reduce((a, i) => a + i.listPrice * i.qty, 0),
    discount: items.reduce((a, i) => a + i.discount, 0),
  };
}

function TotalCells({ row }: { row: TotalRow }) {
  return (
    <>
      <td style={{ ...bd("tblr"), ...HEAD, ...cellPad, textAlign: "center", fontWeight: 700 }}>{row.label}</td>
      {row.sums ? (
        <>
          <td style={{ ...bd("tblr"), ...cellPad, textAlign: "right" }}>
            <Money v={row.sums.list} zero />
          </td>
          <td style={{ ...bd("tblr"), ...cellPad, textAlign: "right" }}>
            <Money v={row.sums.discount} zero />
          </td>
          <td style={{ ...bd("tblr"), ...cellPad }} />
        </>
      ) : (
        <td colSpan={3} style={{ ...bd("tblr"), ...cellPad }} />
      )}
      <td style={{ ...bd("tblr"), ...cellPad, textAlign: "right", fontWeight: row.strong ? 700 : undefined }}>{row.value}</td>
    </>
  );
}

/** 御見積書の下段: 仕上げ長さ（左）と 小計・消費税・税別品・合計（右）＋備考 */
export function QuoteBottom({
  finish,
  totals,
  note,
}: {
  /** 仕上げ長さの欄（3つ以上） */
  finish: ReactNode[];
  totals: TotalRow[];
  note: ReactNode;
}) {
  const n = Math.max(finish.length, totals.length);
  const finishRows = finish.length;
  return (
    <>
      <table className="w-full border-collapse text-[9.5pt]" style={FIXED}>
        <ColGroup cols={QUOTE_COLS} />
        <tbody>
          {Array.from({ length: n }, (_, i) => (
            <tr key={i} style={{ height: "16pt" }}>
              {i === 0 && (
                <td
                  rowSpan={finishRows}
                  colSpan={2}
                  style={{ ...bd("tblr"), ...HEAD, textAlign: "center", verticalAlign: "middle", fontWeight: 700, fontSize: "8.5pt", whiteSpace: "nowrap" }}
                >
                  仕上げ長さ
                </td>
              )}
              {i < finishRows ? (
                <td style={{ ...bd("tblr"), ...cellPad }}>
                  <div className="flex items-center justify-end gap-2">
                    <span className="min-w-0 flex-1">{finish[i]}</span>
                    <span>inch</span>
                  </div>
                </td>
              ) : i === finishRows ? (
                <td colSpan={3} rowSpan={n - finishRows} />
              ) : null}
              {totals[i] ? <TotalCells row={totals[i]} /> : <td colSpan={5} />}
            </tr>
          ))}
        </tbody>
      </table>

      <table className="mt-4 w-full border-collapse text-[9.5pt]" style={FIXED}>
        <ColGroup cols={QUOTE_COLS} />
        <tbody>
          <tr style={{ height: "72pt" }}>
            <td colSpan={2} style={{ ...bd("tblr"), ...HEAD, textAlign: "center", verticalAlign: "middle", fontWeight: 700 }}>
              備考
            </td>
            <td
              colSpan={6}
              style={{
                ...bd("tblr"),
                padding: 0,
                verticalAlign: "top",
                backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 14pt, #000 14pt, #000 14.4pt)",
              }}
            >
              <div className="h-full px-1 leading-[14.4pt] whitespace-pre-wrap">{note}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export type FinishInfo = {
  head: ReactNode;
  balance: ReactNode;
  cpm: ReactNode;
  weight: ReactNode;
  length: ReactNode;
  note: ReactNode;
};

export const ORDER_STEPS = [
  { key: "ordered_on", label: "発注" },
  { key: "arrived_on", label: "到着" },
  { key: "assembled_on", label: "組立" },
  { key: "reve_sent_on", label: "REVE送信" },
  { key: "delivered_on", label: "お渡し" },
  { key: "td_on", label: "TD" },
  { key: "paid_on", label: "お支払い" },
] as const;

/**
 * 御注文書の下段:
 *   左＝仕上げ情報（赤枠 6行）／右＝小計・消費税・前受金・合計、その下に REVE のシャフト情報（赤枠）
 *   最後に 備考（発注〜お支払いの日付と MEMO）
 */
export function OrderBottom({
  info,
  totals,
  reveColor,
  reveSerial,
  steps,
  memo,
  bank,
}: {
  info: FinishInfo;
  totals: TotalRow[];
  reveColor: ReactNode;
  reveSerial: ReactNode;
  steps: { label: string; value: ReactNode }[];
  memo: ReactNode;
  bank?: boolean;
}) {
  const RED = `2px solid ${PAPER.red}`;
  const infoRows: [string, ReactNode][] = [
    ["装着ヘッド", info.head],
    ["バランス", info.balance],
    ["振動数", info.cpm],
    ["総重量", info.weight],
    ["仕上げ長さ", info.length],
    ["その他特記事項", info.note],
  ];
  const t = [...totals];
  while (t.length < 4) t.push({ label: "", value: "" });
  return (
    <>
      <div className="mt-2 flex items-start gap-3">
        {/* 仕上げ情報 */}
        <table className="w-[46%] border-collapse text-[9pt]" style={{ ...FIXED, outline: RED, outlineOffset: "-1px" }}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "30%" }} />
            <col />
          </colgroup>
          <tbody>
            {infoRows.map(([k, v], i) => (
              <tr key={k} style={{ height: "15.5pt" }}>
                {i === 0 && (
                  <td
                    rowSpan={6}
                    style={{ ...bd("tblr"), ...HEAD, textAlign: "center", verticalAlign: "middle", fontWeight: 700, lineHeight: 1.4 }}
                  >
                    仕上げ
                    <br />
                    情報
                  </td>
                )}
                <td style={{ ...bd("tblr"), ...cellPad, whiteSpace: "nowrap", fontSize: "8.5pt" }}>{k}</td>
                <td style={{ ...bd("tblr"), ...cellPad }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 合計と REVE */}
        <div className="min-w-0 flex-1">
          <table className="w-full border-collapse text-[9.5pt]" style={FIXED}>
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "12%" }} />
              <col />
            </colgroup>
            <tbody>
              {t.map((row, i) => (
                <tr key={i} style={{ height: "15.5pt" }}>
                  {row.label ? <TotalCells row={row} /> : <td colSpan={5} />}
                </tr>
              ))}
            </tbody>
          </table>
          <table className="mt-0.5 w-full border-collapse text-[9pt]" style={{ ...FIXED, outline: RED, outlineOffset: "-1px" }}>
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "30%" }} />
              <col />
            </colgroup>
            <tbody>
              <tr style={{ height: "17pt" }}>
                <td
                  rowSpan={2}
                  style={{ ...bd("tblr"), textAlign: "center", verticalAlign: "middle", color: PAPER.red, fontWeight: 700, fontSize: "8pt", lineHeight: 1.25 }}
                >
                  REVEの
                  <br />
                  シャフト
                  <br />
                  情報
                </td>
                <td style={{ ...bd("tblr"), textAlign: "center", color: PAPER.red, fontWeight: 700 }}>カラー</td>
                <td style={{ ...bd("tblr"), ...cellPad }}>{reveColor}</td>
              </tr>
              <tr style={{ height: "17pt" }}>
                <td style={{ ...bd("tblr"), textAlign: "center", color: PAPER.red, fontWeight: 700 }}>シリアル番号</td>
                <td style={{ ...bd("tblr"), ...cellPad }}>{reveSerial}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 備考: 進み具合 */}
      <table className="mt-2 w-full border-collapse text-[9pt]" style={FIXED}>
        <colgroup>
          <col style={{ width: "11%" }} />
          {steps.map((s) => (
            <col key={s.label} style={{ width: "8.2%" }} />
          ))}
          <col />
        </colgroup>
        <tbody>
          <tr style={{ height: "15pt" }}>
            <td rowSpan={3} style={{ ...bd("tblr"), ...HEAD, textAlign: "center", verticalAlign: "middle", fontWeight: 700 }}>
              備考
            </td>
            {steps.map((s) => (
              <td key={s.label} style={{ ...bd("tblr"), textAlign: "center", fontSize: "8pt", whiteSpace: "nowrap" }}>
                {s.label}
              </td>
            ))}
            <td style={{ ...bd("tblr"), textAlign: "center", fontSize: "8pt" }}>MEMO</td>
          </tr>
          <tr style={{ height: "19pt" }}>
            {steps.map((s) => (
              <td key={s.label} style={{ ...bd("tlr"), textAlign: "center", fontSize: "8.5pt", padding: "1px" }}>
                {s.value}
              </td>
            ))}
            <td rowSpan={2} style={{ ...bd("tblr"), ...cellPad, verticalAlign: "top", whiteSpace: "pre-wrap" }}>
              {memo}
            </td>
          </tr>
          <tr style={{ height: "16pt" }}>
            {steps.map((s) => (
              <td key={s.label} style={{ ...bd("blr") }} />
            ))}
          </tr>
        </tbody>
      </table>

      {bank && (
        <p className="mt-2 text-[8.5pt]">
          振込先　{LETTERHEAD.bank}　{LETTERHEAD.bankName}
        </p>
      )}
    </>
  );
}

/** 進み具合の日付を「9／18」に。空は「／」（紙の欄と同じ） */
export function md(v: string | null | undefined) {
  if (!v) return "／";
  const [, m, d] = String(v).split("-");
  return `${Number(m)}／${Number(d)}`;
}

// ---------------------------------------------------------------------------
// Fitting Report（試打シャフト表紙・A4横）
// ---------------------------------------------------------------------------

export type CoverRow = {
  key: string | number;
  lineNo: number;
  demoNo: ReactNode;
  name: ReactNode;
  maker: ReactNode;
  price: ReactNode;
  memo: ReactNode;
  /** 行番号セルに添えるもの（編集画面の「採用」チェックなど） */
  lead?: ReactNode;
};

export function Check({ on, label }: { on: boolean; label: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex h-[11px] w-[11px] items-center justify-center border border-black text-[9px] leading-none"
        aria-hidden
      >
        {on ? "✓" : ""}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function CoverPaper({
  customer,
  date,
  fitter,
  kindPicker,
  menuPicker,
  rows,
  minRows = 10,
}: {
  customer: ReactNode;
  date: ReactNode;
  fitter: ReactNode;
  /** 会員／ビジター（印刷は Check、画面はラジオ） */
  kindPicker: ReactNode;
  /** シャフトフルフィッテイング／シャフトフィッテイング／ボールフィッティング */
  menuPicker: ReactNode;
  rows: CoverRow[];
  minRows?: number;
}) {
  const n = Math.max(minRows, rows.length);
  return (
    <div className="text-[10pt]" style={{ fontFamily: PAPER_FONT }}>
      {/* オレンジの帯 */}
      <div
        className="flex h-[64px] items-center justify-between rounded-tl-[26px] rounded-tr-[26px] px-8"
        style={{ background: PAPER.orange, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      >
        <span className="text-[30px] leading-none text-white" style={{ fontFamily: '"Segoe UI", "Myriad Pro", Arial, sans-serif', fontWeight: 300 }}>
          Fitting Report
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/golfwing-logo-white.png" alt="GOLF WING" className="h-[46px] w-auto" />
      </div>

      <div className="mt-2 flex items-start justify-between gap-8 px-2">
        <div className="min-w-0 flex-1 pt-6">
          <div className="flex w-[82%] items-end gap-2">
            <div className="min-w-0 flex-1 border-b-[3px] border-black pb-0.5 text-center text-[16pt] font-bold">{customer}</div>
            <div className="shrink-0 text-[13pt]">様</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-16 gap-y-1 pl-[12%] text-[9.5pt]">{kindPicker}</div>
          <div className="mt-1 flex flex-wrap gap-x-10 gap-y-1 pl-[12%] text-[9.5pt]">{menuPicker}</div>
        </div>
        <div className="w-[230px] shrink-0 text-right text-[9.5pt]">
          <div>フィッティング実施日</div>
          <div className="mt-2 text-[11pt]">{date}</div>
          <div className="mt-3 flex items-end justify-end gap-2">
            <span className="shrink-0">担当フィッター</span>
            <span className="min-w-[96px] border-b border-black text-left">{fitter}</span>
          </div>
        </div>
      </div>

      <table className="mt-3 w-full border-collapse text-[9.5pt]" style={FIXED}>
        <ColGroup cols={COVER_COLS} />
        <thead>
          <tr style={{ height: "30pt" }}>
            <th style={{ ...bd("tblr"), background: PAPER.coverHead }} />
            {["試打NO", "シャフト名", "メーカー名", "定価", "memo"].map((h) => (
              <th key={h} style={{ ...bd("tblr"), background: PAPER.coverHead, fontWeight: 400, fontSize: "9pt" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => {
            const r = rows[i];
            return (
              <tr key={r?.key ?? `e${i}`} style={{ height: "19.5pt" }}>
                <td style={{ ...bd("tblr"), padding: "0 3px", fontSize: "8pt" }}>
                  <div className="flex items-center justify-between gap-1">
                    <span>{r?.lineNo ?? i + 1}</span>
                    {r?.lead}
                  </div>
                </td>
                <td style={{ ...bd("tblr"), background: PAPER.coverHead, padding: "0 3px", textAlign: "center" }}>{r?.demoNo ?? ""}</td>
                <td style={{ ...bd("tblr"), padding: "0 4px" }}>{r?.name ?? ""}</td>
                <td style={{ ...bd("tblr"), padding: "0 4px" }}>{r?.maker ?? ""}</td>
                <td style={{ ...bd("tblr"), padding: "0 4px", textAlign: "right" }}>{r?.price ?? ""}</td>
                <td style={{ ...bd("tblr"), padding: "0 4px" }}>{r?.memo ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        className="mt-5 flex h-[26px] items-center justify-between px-6 text-[8.5pt] font-bold text-white"
        style={{ background: PAPER.footer, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      >
        <span className="truncate">{LETTERHEAD.storeLine}</span>
        <span className="ml-4 shrink-0 tracking-wide">BIG DISTANCE</span>
      </div>
    </div>
  );
}

/** DB の明細（＋計算結果）を紙の行にする。印刷と注文書画面で共通 */
export function toPaperItems(
  items: {
    id: number;
    line_kind?: string | null;
    item_category?: string | null;
    demo_no: number | null;
    club_type?: string | null;
    product_name: string;
    spec: string | null;
    manufacturer?: string | null;
    list_price: number | string | null;
    quantity?: number | string | null;
    finish_length_inch: number | null;
  }[],
  priced: { amount?: number | null; discountAmount?: number | null }[],
): PaperItem[] {
  return items.map((it, i) => ({
    id: it.id,
    lineKind: it.line_kind ?? "product",
    category: it.item_category ?? null,
    demoNo: it.demo_no,
    kind: it.club_type ?? "",
    name: `${it.product_name}${it.spec ? ` ${it.spec}` : ""}`,
    productName: it.product_name,
    maker: it.manufacturer ?? "",
    listPrice: Number(it.list_price ?? 0),
    discount: Number(priced[i]?.discountAmount ?? 0),
    qty: Number(it.quantity ?? 1),
    amount: Number(priced[i]?.amount ?? 0),
    finishInch: it.finish_length_inch,
  }));
}

/** 紙の表記（Excel の字面どおり「フィッテイング」）。値は gw_fittings.fitting_menu */
export const MENU_LABELS: Record<string, string> = {
  シャフトフルフィッティング: "シャフトフルフィッテイング",
  シャフトフィッティング: "シャフトフィッテイング",
  ボールフィッティング: "ボールフィッティング",
};
