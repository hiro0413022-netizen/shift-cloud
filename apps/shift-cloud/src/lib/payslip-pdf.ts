import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { yen, fmtMinutes } from "@/lib/util";
import { sumSheetDays, type SheetDay } from "@/lib/payslip-sheet";

/**
 * 給与明細（出勤簿つき）PDF 生成 — /admin/payroll の「明細PDF」
 *
 * 1スタッフ=1ページ（A4縦）。上段に支給見込みの明細、下段にその月の日別出勤簿。
 * 金額は payroll_items（=「集計を実行」の結果）をそのまま印字し、ここでは再計算しない。
 *
 * フォント: src/assets/NotoSansJP-Regular.ttf（genesisの入会控えPDFと同じサブセット済ファイル。
 * next.config.ts の outputFileTracingIncludes で /admin/payroll/pdf に同梱）。
 * ⚠ embedFont の subset:true は使わない — pdf-lib のサブセット埋め込みは
 * このフォントでグリフが欠落する（#129 / 2026-08-11 に poppler・ghostscript 両方で確認）。
 */

const LINE = rgb(0.45, 0.45, 0.45);
const GRAY = rgb(0.93, 0.93, 0.93);
const TXT = rgb(0.1, 0.1, 0.1);
const SUB = rgb(0.42, 0.42, 0.42);
const RED = rgb(0.72, 0.1, 0.1);

const W = 595; // A4縦
const H = 842;
const MX = 40; // 左右マージン
const CW = W - MX * 2; // 515

export type PayslipStaffInput = {
  name: string;
  employmentLabel: string; // 社員/アルバイト など表示ラベル
  wageLabel: string; // "時給 2,500円" / "月給" など（空可）
  daysWorked: number;
  workMinutes: number; // 日次丸め後の合算（payroll_items.work_minutes）
  overtimeMinutes: number;
  baseAmount: number;
  overtimeAmount: number;
  commuteAmount: number;
  allowanceAmount: number;
  deductionAmount: number;
  totalAmount: number;
  days: SheetDay[];
};

export type PayslipPdfInput = {
  companyName: string;
  ymLabel: string; // "2026年7月度"
  generatedOn: string; // "2026/08/16"（JST）
  roundingMinutes: number; // 会社設定。注記に使う
  staff: PayslipStaffInput[];
};

const SHEET_COLS = [
  { key: "date", label: "日付", w: 64 },
  { key: "shift", label: "シフト", w: 82 },
  { key: "in", label: "出勤", w: 44 },
  { key: "out", label: "退勤", w: 44 },
  { key: "break", label: "休憩", w: 48 },
  { key: "work", label: "実働", w: 52 },
  { key: "ot", label: "残業", w: 44 },
  { key: "notes", label: "備考", w: 137 },
] as const;

function fmtMin(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export async function buildPayslipPdf(input: PayslipPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = readFileSync(path.join(process.cwd(), "src/assets/NotoSansJP-Regular.ttf"));
  const font = await doc.embedFont(fontBytes); // subset:true 禁止（上記コメント）

  for (const s of input.staff) {
    drawStaffPage(doc, font, input, s);
  }
  return doc.save();
}

function drawStaffPage(
  doc: PDFDocument,
  font: PDFFont,
  input: PayslipPdfInput,
  s: PayslipStaffInput
) {
  const page = doc.addPage([W, H]);

  const text = (
    str: string,
    x: number,
    y: number,
    size = 9,
    color = TXT
  ) => page.drawText(str ?? "", { x, y, size, font, color });
  const textRight = (str: string, xRight: number, y: number, size = 9, color = TXT) => {
    const w = font.widthOfTextAtSize(str, size);
    page.drawText(str, { x: xRight - w, y, size, font, color });
  };
  const box = (x: number, y: number, w: number, h: number, fill?: boolean) =>
    page.drawRectangle({
      x, y, width: w, height: h,
      borderColor: LINE, borderWidth: 0.7,
      ...(fill ? { color: GRAY } : {}),
    });

  // ===== ヘッダー
  text("給与明細（支給見込み）", MX, H - 52, 17);
  textRight(input.ymLabel, W - MX, H - 48, 13);
  textRight(`${input.companyName}　出力日 ${input.generatedOn}`, W - MX, H - 66, 8, SUB);
  page.drawLine({ start: { x: MX, y: H - 74 }, end: { x: W - MX, y: H - 74 }, thickness: 1, color: LINE });

  // ===== スタッフ名
  text(s.name, MX, H - 100, 14);
  const nameW = font.widthOfTextAtSize(s.name, 14);
  const sub = [s.employmentLabel, s.wageLabel].filter(Boolean).join("　");
  if (sub) text(sub, MX + nameW + 12, H - 98, 9, SUB);

  // ===== 勤怠サマリー（3セル）
  let y = H - 118;
  const rowH = 20;
  {
    const cw = CW / 3;
    const cells: Array<[string, string]> = [
      ["出勤日数", `${s.daysWorked}日`],
      ["勤務時間", fmtMinutes(s.workMinutes)],
      ["残業時間", s.overtimeMinutes > 0 ? fmtMinutes(s.overtimeMinutes) : "—"],
    ];
    cells.forEach(([k, v], i) => {
      box(MX + cw * i, y - rowH, cw, rowH, true);
      text(k, MX + cw * i + 8, y - rowH + 6, 8, SUB);
      textRight(v, MX + cw * (i + 1) - 8, y - rowH + 6, 10);
    });
    y -= rowH;
  }

  // ===== 支給明細（6セル・見出し行＋金額行）
  {
    const labels = ["基本給", "残業代", "交通費", "手当", "控除", "支給見込み"];
    const values = [
      yen(s.baseAmount),
      yen(s.overtimeAmount),
      yen(s.commuteAmount),
      yen(s.allowanceAmount),
      s.deductionAmount > 0 ? `-${yen(s.deductionAmount)}` : yen(0),
      yen(s.totalAmount),
    ];
    const cw = CW / 6;
    labels.forEach((l, i) => {
      box(MX + cw * i, y - rowH, cw, rowH, true);
      text(l, MX + cw * i + 6, y - rowH + 6, 8, SUB);
    });
    y -= rowH;
    values.forEach((v, i) => {
      box(MX + cw * i, y - rowH, cw, rowH);
      textRight(v, MX + cw * (i + 1) - 6, y - rowH + 6, i === 5 ? 10 : 9);
    });
    y -= rowH;
  }

  // ===== 出勤簿
  y -= 22;
  text("日別出勤簿", MX, y, 10);
  y -= 6;

  const sheetRowH = 15;
  const totals = sumSheetDays(s.days);

  // 見出し行
  {
    let x = MX;
    for (const c of SHEET_COLS) {
      box(x, y - sheetRowH, c.w, sheetRowH, true);
      text(c.label, x + 4, y - sheetRowH + 4, 7.5, SUB);
      x += c.w;
    }
    y -= sheetRowH;
  }

  if (s.days.length === 0) {
    box(MX, y - sheetRowH, CW, sheetRowH);
    text("この月の出勤記録はありません", MX + 6, y - sheetRowH + 4, 8, SUB);
    y -= sheetRowH;
  }

  for (const d of s.days) {
    const missing = d.workMinutes == null;
    let x = MX;
    const vals: string[] = [
      d.dateLabel,
      d.shiftLabel || "—",
      d.clockIn,
      d.clockOut,
      d.breakLabel,
      fmtMin(d.workMinutes),
      d.overtimeMinutes > 0 ? fmtMin(d.overtimeMinutes) : "—",
      d.notes.join("・"),
    ];
    SHEET_COLS.forEach((c, i) => {
      box(x, y - sheetRowH, c.w, sheetRowH);
      const color = missing ? RED : i === 7 && vals[7] ? SUB : TXT;
      if (i === 5 || i === 6) textRight(vals[i], x + c.w - 4, y - sheetRowH + 4, 8, color);
      else text(vals[i], x + 4, y - sheetRowH + 4, i === 7 ? 7.5 : 8, color);
      x += c.w;
    });
    y -= sheetRowH;
  }

  // 合計行
  {
    const leftW = SHEET_COLS[0].w + SHEET_COLS[1].w + SHEET_COLS[2].w + SHEET_COLS[3].w + SHEET_COLS[4].w;
    box(MX, y - sheetRowH, leftW, sheetRowH, true);
    text(`合計（出勤${totals.daysWorked}日）`, MX + 4, y - sheetRowH + 4, 8);
    let x = MX + leftW;
    box(x, y - sheetRowH, SHEET_COLS[5].w, sheetRowH, true);
    textRight(fmtMin(totals.workMinutes), x + SHEET_COLS[5].w - 4, y - sheetRowH + 4, 8);
    x += SHEET_COLS[5].w;
    box(x, y - sheetRowH, SHEET_COLS[6].w, sheetRowH, true);
    textRight(totals.overtimeMinutes > 0 ? fmtMin(totals.overtimeMinutes) : "—", x + SHEET_COLS[6].w - 4, y - sheetRowH + 4, 8);
    x += SHEET_COLS[6].w;
    box(x, y - sheetRowH, SHEET_COLS[7].w, sheetRowH, true);
    if (totals.missingDays > 0) text(`打刻なし ${totals.missingDays}日`, x + 4, y - sheetRowH + 4, 7.5, RED);
    y -= sheetRowH;
  }

  // ===== 注記
  y -= 14;
  const notes: string[] = [];
  notes.push("※ 支給見込みは社会保険料・税等の控除前の概算です。正式な支給額は給与明細書に従います。");
  if (input.roundingMinutes > 0) {
    notes.push(
      `※ 勤務時間は日ごとに${input.roundingMinutes}分単位で切り捨てて合算するため、出勤簿の実働合計と一致しない場合があります。`
    );
  }
  notes.push("※ 休憩の「＊」は手動修正、実働・残業の表記は 時:分 です。");
  for (const n of notes) {
    text(n, MX, y, 7.5, SUB);
    y -= 11;
  }
}
