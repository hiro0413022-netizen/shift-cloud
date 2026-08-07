import "server-only";
import ExcelJS from "exceljs";

/**
 * 売上一覧のExcel出力。
 *
 * レイアウトは現場が使っている「新ゴルフウィング売上データ.xlsx」の
 * 「◯◯期売上一覧」シートに合わせてある（列順・列幅・書式・数式・色・オートフィルタ）。
 * そのまま既存ブックへコピペできることが要件なので、勝手に列を足したり並べ替えたりしないこと。
 *
 * 列: A日付 B お客様名 C 会員orビジター D 品目 E 種類 F メーカー名 G 品名
 *     H 定価 I 割引額 J 売価 K 個数 L 金額 M 税込 N 支払い方法 O 備考
 *     P 担当プロ Q 販売者 R 入力者 ／ W 掛け率 X 仕入れ値 Y 個数 Z 金額 AA 粗利
 *
 * J/L/M/W/Y/Z/AA は元ファイルと同じ「数式」で書く（値ではない）。
 * 現場が定価や割引額を直したら売価・金額・税込・粗利が追従する、という運用を壊さないため。
 */

export type SalesExportRow = {
  /** YYYY-MM-DD */
  soldOn: string;
  customerName: string;
  /** 会員 / ビジター / スタッフ */
  memberKind: string;
  /** 品目（利用料 / 月会費 / 販売 …） */
  itemCategory: string;
  /** 種類（ボール / グリップ / 打席利用 …） */
  itemType: string;
  maker: string;
  productName: string;
  /** 定価。無ければ売価をそのまま入れる（割引額は空になり売価＝定価） */
  listPrice: number | null;
  /** 割引額（値引きはマイナス） */
  discount: number | null;
  qty: number;
  payMethod: string;
  memo: string;
  pro: string;
  seller: string;
  enteredBy: string;
  /** 仕入れ値（在庫マスタから。無ければ粗利ブロックは空欄） */
  costPrice: number | null;
};

/**
 * テーマ色（見出しの薄い紺、粗利のオレンジ）。
 * ExcelJSは theme/tint を書き出せるが型定義に無いのでここだけキャストする。
 * argbに焼くとブックのテーマを変えたとき見出しだけ色が取り残されるため、テーマ色のまま渡す。
 */
function themeFill(theme: number, tint: number): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { theme, tint } as unknown as ExcelJS.Color };
}
const HEADER_FILL = themeFill(3, 0.7999816888943144);
const PROFIT_FILL = themeFill(5, 0.3999755851924192);
const COST_FILL: ExcelJS.Fill = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" },
};
const THIN = { style: "thin" } as ExcelJS.Border;
const BOX: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const MEIRYO = "メイリオ";
const MSPG = "ＭＳ Ｐゴシック";
/** 文字色は「自動」（テーマ1）。元ファイルと同じにしておくとダークテーマでも化けない */
const AUTO = { theme: 1 } as ExcelJS.Color;
const RED = { argb: "FFFF0000" } as ExcelJS.Color;

type ColSpec = {
  header: string;
  width: number;
  numFmt: string;
  align: "center" | "left";
  font: string;
  /** 見出しセルだけ書式が違う列（税込）用 */
  headerNumFmt?: string;
  /** 備考だけ赤字（元ファイルと同じ） */
  red?: boolean;
};

/** A〜R（明細ブロック） */
const COLS: ColSpec[] = [
  { header: "日付",          width: 13.375, numFmt: "yyyy/m/d;@",              align: "center", font: MEIRYO },
  { header: "お客様名",      width: 16.375, numFmt: "General",                 align: "center", font: MSPG },
  { header: "会員orビジター", width: 13.5,  numFmt: "General",                 align: "center", font: MSPG },
  { header: "品目",          width: 10,     numFmt: "General",                 align: "center", font: MEIRYO },
  { header: "種類",          width: 19.5,   numFmt: "General",                 align: "center", font: MEIRYO },
  { header: "メーカー名",    width: 18,     numFmt: "General",                 align: "center", font: MEIRYO },
  { header: "品名",          width: 40,     numFmt: "General",                 align: "left",   font: MEIRYO },
  { header: "定価",          width: 12.75,  numFmt: "#,##0_);[Red](#,##0)",    align: "center", font: MEIRYO },
  { header: "割引額",        width: 11.75,  numFmt: "0_ ;[Red]\\-0\\ ",        align: "center", font: MEIRYO },
  { header: "売価",          width: 11.5,   numFmt: "#,##0_);[Red](#,##0)",    align: "center", font: MEIRYO },
  { header: "個数",          width: 10.25,  numFmt: "General",                 align: "center", font: MEIRYO },
  { header: "金額",          width: 10.375, numFmt: "#,##0_);[Red](#,##0)",    align: "center", font: MEIRYO },
  { header: "税込",          width: 10.875, numFmt: "#,##0_);\\(#,##0\\)",     align: "center", font: MEIRYO, headerNumFmt: "#,##0_);[Red](#,##0)" },
  { header: "支払い方法",    width: 12.875, numFmt: "General",                 align: "center", font: MEIRYO },
  { header: "備考",          width: 27.875, numFmt: "General",                 align: "left",   font: MEIRYO, red: true },
  { header: "担当プロ",      width: 7,      numFmt: "General",                 align: "center", font: MEIRYO },
  { header: "販売者",        width: 9,      numFmt: "General",                 align: "center", font: MEIRYO },
  { header: "入力者",        width: 9,      numFmt: "General",                 align: "center", font: MEIRYO },
];

/** W〜AA（原価・粗利ブロック）。S〜Vは元ファイルどおり空けたまま。Z/AAは既定幅 */
const COST_COLS: { header: string; width?: number; numFmt: string }[] = [
  { header: "掛け率",   width: 12.5,  numFmt: "0.00_ " },
  { header: "仕入れ値", width: 11.75, numFmt: "#,##0_);[Red](#,##0)" },
  { header: "個数",     width: 10,    numFmt: "#,##0_);[Red](#,##0)" },
  { header: "金額",                   numFmt: "#,##0_);[Red](#,##0)" },
  { header: "粗利",                   numFmt: "#,##0_);[Red](#,##0)" },
];
const COST_START = 23; // W列
const LAST_COL = 29;   // AC列（オートフィルタの右端。元ファイルと同じ）

/**
 * Excelのシリアル値（1899-12-30起点）。
 * Dateを渡すと実行環境のタイムゾーンで前日にずれるため、必ず数値で書き込む（#73と同じ理由）。
 */
function excelSerial(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((t - Date.UTC(1899, 11, 30)) / 86400000);
}

/**
 * 決算期（GOLF WINGは6月始まり。2025-06〜2026-05 が31期）。
 * シート名を「31期売上一覧」の形にして、既存ブックへ貼りやすくする。
 */
export function fiscalTerm(ymd: string): number {
  const [y, m] = ymd.split("-").map(Number);
  const fyStart = m >= 6 ? y : y - 1;
  return 31 + (fyStart - 2025);
}

export function buildSalesWorkbook(rows: SalesExportRow[], sheetName: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Money OS";
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName, {
    // 左2列（日付・お客様名）と見出し行を固定。元ファイルと同じ
    views: [{ state: "frozen", xSplit: 2, ySplit: 1, zoomScale: 70 }],
    properties: { defaultRowHeight: 21.75 },
  });

  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  COST_COLS.forEach((c, i) => { if (c.width != null) ws.getColumn(COST_START + i).width = c.width; });
  ws.getColumn(19).width = 6.5;    // S
  ws.getColumn(20).width = 2.625;  // T
  ws.getColumn(22).width = 2.625;  // V
  ws.getColumn(28).width = 15;     // AB
  ws.getColumn(29).width = 8.125;  // AC

  // ---- 見出し行
  const head = ws.getRow(1);
  head.height = 21.75;
  COLS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: c.font, size: 11, color: AUTO };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: c.align, vertical: "middle" };
    cell.numFmt = c.headerNumFmt ?? c.numFmt;
    cell.border = BOX;
  });
  // S〜U は見出し無しだが色は続いている（元ファイルどおり）
  for (let c = 19; c <= 21; c++) {
    const cell = head.getCell(c);
    cell.font = { name: MEIRYO, size: 11, color: AUTO };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }
  COST_COLS.forEach((c, i) => {
    const cell = head.getCell(COST_START + i);
    cell.value = c.header;
    cell.font = { name: MSPG, size: 11, color: AUTO };
    cell.fill = c.header === "粗利" ? PROFIT_FILL : COST_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.numFmt = c.numFmt;
    cell.border = BOX;
  });

  // ---- 明細行
  rows.forEach((r, idx) => {
    const n = idx + 2;
    const row = ws.getRow(n);
    row.height = 21.75;

    const values: (ExcelJS.CellValue | null)[] = [
      excelSerial(r.soldOn),
      r.customerName || null,
      r.memberKind || null,
      r.itemCategory || null,
      r.itemType || null,
      r.maker || null,
      r.productName || null,
      r.listPrice ?? null,
      r.discount ?? null,
      { formula: `SUM(H${n}:I${n})` },
      r.qty ?? null,
      { formula: `SUM(J${n}*K${n})` },
      { formula: `ROUNDDOWN(L${n}*1.1,0)` },
      r.payMethod || null,
      r.memo || null,
      r.pro || null,
      r.seller || null,
      r.enteredBy || null,
    ];

    COLS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = values[i];
      if (v !== null && v !== undefined && v !== "") cell.value = v;
      cell.font = { name: c.font, size: 11, color: c.red ? RED : AUTO };
      cell.alignment = { horizontal: c.align, vertical: "middle" };
      cell.numFmt = c.numFmt;
      cell.border = BOX;
    });

    // 仕入れ値が分かる行（在庫リストに紐づく販売）だけ粗利ブロックを埋める
    const costValues: (ExcelJS.CellValue | null)[] = r.costPrice == null
      ? [null, null, null, null, null]
      : [
          { formula: `X${n}/H${n}` },
          r.costPrice,
          { formula: `K${n}` },
          { formula: `X${n}*Y${n}` },
          { formula: `L${n}-Z${n}` },
        ];
    COST_COLS.forEach((c, i) => {
      const cell = row.getCell(COST_START + i);
      const v = costValues[i];
      if (v !== null) cell.value = v;
      cell.font = { name: MSPG, size: 11, color: AUTO };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.numFmt = c.numFmt;
    });
  });

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: LAST_COL },
  };

  return wb;
}
