import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { isTentative, jpDate, type ExportRow } from "@/lib/csv";

/**
 * ゴルフ場提出用「月間派遣一覧」PDF（小川さん依頼 2026-08-22 / #145）
 *
 * CSVはExcelで開く相手向け。PDFは**そのまま印刷・回覧できる形**が要るので、
 * 罫線つきの1枚もの（A4縦）にする。中身の元データはCSVと同じ ExportRow なので、
 * CSVとPDFで内容がズレることはない。
 *
 * 仮（tentative）を含めて出す場合は、状態列と表題と注記の3か所で「予定」と明示する。
 * 黙って混ぜると「確定したはず」の事故になるため、混ぜるなら必ず見えるようにする。
 *
 * フォント: src/assets/NotoSansJP-Regular.ttf（genesis の入会控え・給与明細PDFと同じファイル）。
 * ⚠ embedFont の subset:true は使わない — このフォントでグリフが欠落する（#129 で確認済み）。
 */

const W = 595; // A4縦
const H = 842;
const MX = 42;
const CW = W - MX * 2;

const TXT = rgb(0.1, 0.1, 0.1);
const SUB = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.55, 0.55, 0.55);
const HEAD = rgb(0.92, 0.93, 0.96);
const WARN = rgb(0.72, 0.42, 0.05);

export type ExportPdfInput = {
  companyName: string;
  clientName: string;
  ymLabel: string; // "2026年8月"
  generatedOn: string; // "2026/08/22"
  contactName: string | null;
  rows: ExportRow[];
  /** 仮を含めて出しているか（表題と注記が変わる） */
  withTentative: boolean;
};

const COLS = [
  { key: "date", label: "日付", w: 92 },
  { key: "caddie", label: "キャディ名", w: 190 },
  { key: "status", label: "状態", w: 56 },
  { key: "memo", label: "備考", w: CW - 92 - 190 - 56 },
] as const;

const ROW_H = 20;

export async function buildExportPdf(input: ExportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = readFileSync(path.join(process.cwd(), "src/assets/NotoSansJP-Regular.ttf"));
  const font = await doc.embedFont(fontBytes); // subset:true 禁止（上記コメント）

  // 1ページ目は見出しぶん行数が少ない。以降は表だけなので多く入る
  const FIRST = 26;
  const REST = 33;
  const pages: ExportRow[][] = [];
  let rest = input.rows.slice();
  pages.push(rest.slice(0, FIRST));
  rest = rest.slice(FIRST);
  while (rest.length > 0) {
    pages.push(rest.slice(0, REST));
    rest = rest.slice(REST);
  }

  pages.forEach((chunk, i) => drawPage(doc, font, input, chunk, i + 1, pages.length));
  return doc.save();
}

function drawPage(
  doc: PDFDocument,
  font: PDFFont,
  input: ExportPdfInput,
  rows: ExportRow[],
  pageNo: number,
  pageCount: number
) {
  const page: PDFPage = doc.addPage([W, H]);
  const text = (s: string, x: number, y: number, size = 9.5, color = TXT) =>
    page.drawText(s ?? "", { x, y, size, font, color });
  const textRight = (s: string, xRight: number, y: number, size = 9.5, color = TXT) =>
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color });

  let y = H - 56;

  if (pageNo === 1) {
    // ===== 表題
    const title = input.withTentative ? "キャディ派遣 予定表" : "キャディ派遣 日程表";
    text(title, MX, y, 18);
    textRight(`${input.companyName}`, W - MX, y + 2, 10, SUB);
    y -= 22;
    text(`${input.clientName} 御中`, MX, y, 12);
    textRight(`出力日 ${input.generatedOn}`, W - MX, y, 8.5, SUB);
    y -= 18;
    text(input.ymLabel, MX, y, 11, SUB);
    if (input.contactName) textRight(`ご担当 ${input.contactName} 様`, W - MX, y, 8.5, SUB);
    y -= 14;
    page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 1, color: LINE });
    y -= 20;

    // ===== 集計
    const days = new Set(input.rows.map((r) => r.date)).size;
    const caddies = new Set(input.rows.map((r) => r.caddie_name)).size;
    const kari = input.rows.filter(isTentative).length;
    text(`合計 ${input.rows.length} 人工 ／ ${days} 日 ／ キャディ ${caddies} 名`, MX, y, 10);
    y -= 16;

    if (input.withTentative && kari > 0) {
      text(
        `※ このうち ${kari} 件は「仮」です。予定のため変更になる場合があります。確定後にあらためてお送りします。`,
        MX,
        y,
        9,
        WARN
      );
      y -= 16;
    }
    y -= 4;
  } else {
    text(`${input.clientName} 御中　${input.ymLabel}　キャディ派遣一覧（続き）`, MX, y, 10, SUB);
    y -= 18;
  }

  // ===== 表ヘッダー
  const drawRow = (cells: string[], top: number, isHeader: boolean) => {
    let x = MX;
    COLS.forEach((c, i) => {
      page.drawRectangle({
        x,
        y: top - ROW_H,
        width: c.w,
        height: ROW_H,
        borderColor: LINE,
        borderWidth: 0.7,
        ...(isHeader ? { color: HEAD } : {}),
      });
      page.drawText(cells[i] ?? "", {
        x: x + 6,
        y: top - ROW_H + 6.5,
        size: isHeader ? 9 : 9.5,
        font,
        color: isHeader ? TXT : TXT,
      });
      x += c.w;
    });
  };

  drawRow(COLS.map((c) => c.label), y, true);
  y -= ROW_H;

  for (const r of rows) {
    drawRow([jpDate(r.date), r.caddie_name, isTentative(r) ? "仮" : "確定", r.memo ?? ""], y, false);
    y -= ROW_H;
  }

  // ===== フッター
  textRight(`${pageNo} / ${pageCount}`, W - MX, 34, 8.5, SUB);
  text(input.companyName, MX, 34, 8.5, SUB);
}
