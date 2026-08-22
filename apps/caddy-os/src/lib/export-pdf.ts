import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { jpDate, type ExportRow } from "@/lib/csv";

/**
 * ゴルフ場提出用「月間派遣一覧」PDF（小川さん依頼 2026-08-22 / #145）
 *
 * CSVはExcelで開く相手向け。PDFは**そのまま印刷・回覧できる形**が要るので、
 * 罫線つきの1枚もの（A4縦）にする。中身の元データはCSVと同じ ExportRow なので、
 * CSVとPDFで内容がズレることはない。
 *
 * **同じ日に複数名入る日は1行にまとめる**（小川さん指示 2026-08-22 / #145c）。
 * 1件1行だと「8/7が3行」のように同じ日付が並んでゴルフ場側が数えづらい。
 * PDFは1ゴルフ場ぶんなので、日付でまとめれば「その日に何人来るか」が1行で分かる。
 *
 * ⚠ **仮かどうかはゴルフ場に出さない**（小川さん指示 2026-08-22 / #145b）。
 * ゴルフ場から見ればこれは「提出された予定」であって、確定/仮はYOZAN社内の管理状態でしかない。
 * 表題だけ「予定表」にして、行ごとの状態も件数も出さない。社内画面（カレンダー・派遣台帳）では
 * 引き続き 破線＋「仮」で区別できる。
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
  { key: "date", label: "日付", w: 86 },
  { key: "count", label: "人数", w: 42 },
  { key: "caddie", label: "キャディ名", w: 245 },
  { key: "memo", label: "備考", w: CW - 86 - 42 - 245 },
] as const;

const LINE_H = 13; // 行内の1行ぶんの高さ
const ROW_PAD = 7; // 上下の余白
const ROW_H = LINE_H + ROW_PAD; // 1行だけのときの高さ

/** 同じ日付をまとめた1行 */
type DayRow = {
  date: string;
  names: string[];
  memo: string;
};

/** 日付でまとめる。名前は元の並び（日付→キャディ名順）を保つ */
export function groupByDate(rows: ExportRow[]): DayRow[] {
  const m = new Map<string, DayRow>();
  for (const r of rows) {
    const cur = m.get(r.date) ?? { date: r.date, names: [], memo: "" };
    cur.names.push(r.caddie_name);
    // 備考は入っているものだけを重複なくつなぐ
    const memo = (r.memo ?? "").trim();
    if (memo && !cur.memo.includes(memo)) cur.memo = cur.memo ? `${cur.memo} / ${memo}` : memo;
    m.set(r.date, cur);
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 幅に収まるように折り返す。日本語は単語境界が無いので1文字ずつ詰める */
function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  if (!text) return [""];
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    const next = cur + ch;
    if (font.widthOfTextAtSize(next, size) > maxW && cur) {
      out.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  out.push(cur);
  return out;
}

export async function buildExportPdf(input: ExportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = readFileSync(path.join(process.cwd(), "src/assets/NotoSansJP-Regular.ttf"));
  const font = await doc.embedFont(fontBytes); // subset:true 禁止（上記コメント）

  // 同じ日は1行にまとめる（#145c）
  const dayRows = groupByDate(input.rows);

  // 名前が多い日は行が高くなるので、件数ではなく **高さ** でページを割る
  const nameW = COLS[2].w - 12;
  const memoW = COLS[3].w - 12;
  const measured = dayRows.map((r) => {
    const lines = Math.max(
      wrap(font, r.names.join("、"), 9.5, nameW).length,
      wrap(font, r.memo, 9, memoW).length,
      1
    );
    return { row: r, lines, h: lines * LINE_H + ROW_PAD };
  });

  const FIRST_H = 560; // 1ページ目は見出しぶん表に使える高さが少ない
  const REST_H = 690;
  const pages: (typeof measured)[] = [];
  let cur: typeof measured = [];
  let used = 0;
  for (const m of measured) {
    const limit = pages.length === 0 ? FIRST_H : REST_H;
    if (cur.length > 0 && used + m.h > limit) {
      pages.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(m);
    used += m.h;
  }
  pages.push(cur);

  pages.forEach((chunk, i) => drawPage(doc, font, input, chunk, i + 1, pages.length));
  return doc.save();
}

function drawPage(
  doc: PDFDocument,
  font: PDFFont,
  input: ExportPdfInput,
  rows: Array<{ row: DayRow; lines: number; h: number }>,
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
    text(`合計 ${input.rows.length} 人工 ／ ${days} 日 ／ キャディ ${caddies} 名`, MX, y, 10);
    y -= 16;

    if (input.withTentative) {
      // 何件が仮かは書かない。あくまで「予定なので変わることがある」だけを伝える
      text("※ 予定のため変更になる場合があります。変更が生じた際はあらためてご連絡いたします。", MX, y, 9, WARN);
      y -= 16;
    }
    y -= 4;
  } else {
    text(`${input.clientName} 御中　${input.ymLabel}　キャディ派遣一覧（続き）`, MX, y, 10, SUB);
    y -= 18;
  }

  // ===== 表
  /** セルを1つ描く。text は折り返し済みの配列 */
  const drawCell = (x: number, top: number, w: number, h: number, lines: string[], size: number, header: boolean) => {
    page.drawRectangle({
      x,
      y: top - h,
      width: w,
      height: h,
      borderColor: LINE,
      borderWidth: 0.7,
      ...(header ? { color: HEAD } : {}),
    });
    lines.forEach((ln, i) => {
      page.drawText(ln, { x: x + 6, y: top - ROW_PAD - LINE_H * i + 3.5, size, font, color: TXT });
    });
  };

  // ヘッダー
  {
    let x = MX;
    COLS.forEach((c) => {
      drawCell(x, y, c.w, ROW_H, [c.label], 9, true);
      x += c.w;
    });
    y -= ROW_H;
  }

  for (const { row: r, h } of rows) {
    const nameLines = wrap(font, r.names.join("、"), 9.5, COLS[2].w - 12);
    const memoLines = wrap(font, r.memo, 9, COLS[3].w - 12);
    let x = MX;
    drawCell(x, y, COLS[0].w, h, [jpDate(r.date)], 9.5, false);
    x += COLS[0].w;
    drawCell(x, y, COLS[1].w, h, [`${r.names.length}名`], 9.5, false);
    x += COLS[1].w;
    drawCell(x, y, COLS[2].w, h, nameLines, 9.5, false);
    x += COLS[2].w;
    drawCell(x, y, COLS[3].w, h, memoLines, 9, false);
    y -= h;
  }

  // ===== フッター
  textRight(`${pageNo} / ${pageCount}`, W - MX, 34, 8.5, SUB);
  text(input.companyName, MX, 34, 8.5, SUB);
}
