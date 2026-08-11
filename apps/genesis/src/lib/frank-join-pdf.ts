import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, rgb, PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * FRANK GOLF 入会申込書（控え）PDF 生成（#129）
 *
 * レイアウトはゴルフウィングの紙の入会申込書（見本.pdf）に準拠:
 *   左上: タイトル / 右上: 申込日・会員番号
 *   左: 申込者情報（カナ/氏名/性別/生年月日/電話/メール/住所）
 *   右: 入会時お支払い費用（月会費・入会金・計）
 *   下: 申込内容（コース・利用開始日）＋ 電子サイン画像 ＋ 店舗情報
 *
 * フォント: src/assets/NotoSansJP-Regular.ttf（glyf版NotoSansJPをJIS第1・第2水準に
 * サブセットした約2.3MB。next.config.ts の outputFileTracingIncludes でwebhookに同梱）。
 * ⚠ embedFont の subset:true は使わない — pdf-lib のサブセット埋め込みは
 * このフォントでグリフが欠落する（poppler/ghostscript両方で確認・2026-08-11）。
 * フル埋め込みでPDFは約1.4MB＝メール添付として許容。
 */

const GRAY = rgb(0.93, 0.93, 0.93);
const LINE = rgb(0.45, 0.45, 0.45);
const TXT = rgb(0.1, 0.1, 0.1);

export type JoinPdfInput = {
  appliedOn: string; // YYYY/MM/DD
  memberNo: string;
  name: string;
  nameKana?: string | null;
  gender?: string | null; // male/female/other/unknown
  birthDate?: string | null; // YYYY-MM-DD
  phone?: string | null;
  email?: string | null;
  postalCode?: string | null;
  address?: string | null;
  planName: string;
  startDate?: string | null;
  monthlyFeeTaxIncluded: number; // 円
  joiningFeeTaxIncluded: number; // 円（クーポン適用なら0）
  couponApplied?: boolean;
  signatureDataUrl?: string | null; // data:image/png;base64,...
};

const GENDER_JA: Record<string, string> = { male: "男性", female: "女性", other: "その他", unknown: "無回答" };

function ageOf(birth: string | null | undefined, on: Date): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.getTime())) return null;
  let age = on.getFullYear() - b.getFullYear();
  const m = on.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age--;
  return age;
}

function slashDate(s: string | null | undefined): string {
  if (!s) return "";
  return s.replaceAll("-", "/");
}

export async function buildJoinPdf(input: JoinPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = readFileSync(path.join(process.cwd(), "src/assets/NotoSansJP-Regular.ttf"));
  const font = await doc.embedFont(fontBytes);

  // A4横（見本と同じ向き）
  const page = doc.addPage([842, 595]);
  const W = 842;

  const text = (s: string, x: number, y: number, size = 10, f: PDFFont = font, color = TXT) =>
    page.drawText(s ?? "", { x, y, size, font: f, color });
  const box = (x: number, y: number, w: number, h: number, fill?: boolean) =>
    page.drawRectangle({
      x, y, width: w, height: h,
      borderColor: LINE, borderWidth: 0.8,
      ...(fill ? { color: GRAY } : {}),
    });

  // ===== タイトル
  text("FRANK GOLF 入会申込書", 40, 540, 22);

  // ===== 右上: 申込日・会員番号
  {
    const x = 620, w1 = 70, w2 = 130, h = 22;
    box(x, 538, w1, h, true); box(x + w1, 538, w2, h);
    box(x, 516, w1, h, true); box(x + w1, 516, w2, h);
    text("申込日", x + 8, 545, 9); text(input.appliedOn, x + w1 + 10, 545, 10);
    text("会員番号", x + 8, 523, 9); text(input.memberNo, x + w1 + 10, 523, 11);
  }

  // ===== 左: 申込者情報
  text("申込者情報", 40, 498, 9);
  const L = { x: 40, w1: 78, w2: 320, top: 492, h: 24 };
  const rows: Array<[string, string]> = [
    ["カナ", input.nameKana ?? ""],
    ["氏名", input.name],
    ["性別", GENDER_JA[input.gender ?? ""] ?? ""],
    ["生年月日", input.birthDate ? `${slashDate(input.birthDate)}　　${ageOf(input.birthDate, new Date()) ?? ""} 歳` : ""],
    ["電話番号", input.phone ?? ""],
    ["メールアドレス", input.email ?? ""],
  ];
  let y = L.top;
  for (const [k, v] of rows) {
    y -= L.h;
    box(L.x, y, L.w1, L.h, true); box(L.x + L.w1, y, L.w2, L.h);
    text(k, L.x + 6, y + 8, 8.5);
    text(v, L.x + L.w1 + 8, y + 8, 10);
  }
  // 住所（高さ2倍）
  {
    const h = L.h * 2;
    y -= h;
    box(L.x, y, L.w1, h, true); box(L.x + L.w1, y, L.w2, h);
    text("住所", L.x + 6, y + h / 2 - 4, 8.5);
    if (input.postalCode) text(`〒 ${input.postalCode}`, L.x + L.w1 + 8, y + h - 18, 9.5);
    text(input.address ?? "", L.x + L.w1 + 8, y + h - 36, 10);
  }
  const leftBottom = y;

  // ===== 右: 入会時お支払い費用
  const R = { x: 470, w: 350, hh: 22 };
  text("入会時お支払い費用", R.x, 498, 9);
  const priceW = 110;
  let ry = 492 - R.hh;
  box(R.x, ry, R.w - priceW, R.hh, true); box(R.x + R.w - priceW, ry, priceW, R.hh, true);
  text("商品名", R.x + (R.w - priceW) / 2 - 20, ry + 7, 9);
  text("価格（税込）", R.x + R.w - priceW + 24, ry + 7, 9);
  const priceRows: Array<[string, string]> = [
    [`${input.planName}（初回月会費）`, `${input.monthlyFeeTaxIncluded.toLocaleString()}円（税込）`],
  ];
  if (input.joiningFeeTaxIncluded > 0) {
    priceRows.push(["入会金", `${input.joiningFeeTaxIncluded.toLocaleString()}円（税込）`]);
  } else if (input.couponApplied) {
    priceRows.push(["入会金（クーポン適用）", "0円"]);
  }
  for (const [k, v] of priceRows) {
    ry -= R.hh;
    box(R.x, ry, R.w - priceW, R.hh); box(R.x + R.w - priceW, ry, priceW, R.hh);
    text(k, R.x + 8, ry + 7, 9.5);
    text(v, R.x + R.w - priceW + 8, ry + 7, 9.5);
  }
  // 空行を数行
  for (let i = 0; i < 3; i++) {
    ry -= R.hh;
    box(R.x, ry, R.w - priceW, R.hh); box(R.x + R.w - priceW, ry, priceW, R.hh);
  }
  // 計
  ry -= R.hh;
  box(R.x, ry, R.w - priceW, R.hh); box(R.x + R.w - priceW, ry, priceW, R.hh);
  text("計", R.x + 8, ry + 7, 9.5);
  const total = input.monthlyFeeTaxIncluded + Math.max(0, input.joiningFeeTaxIncluded);
  text(`${total.toLocaleString()}円（税込）`, R.x + R.w - priceW + 8, ry + 7, 10);

  // ===== 下: 申込内容
  const cy = Math.min(leftBottom, ry) - 34;
  text("申込内容", 40, cy + 16, 9);
  {
    const x = 40, wCourse = 420, wDate = 120, h = 24;
    box(x, cy - h, wCourse, h, true); box(x + wCourse, cy - h, wDate, h, true);
    text("コース", x + wCourse / 2 - 14, cy - h + 8, 9);
    text("利用開始日", x + wCourse + 30, cy - h + 8, 9);
    box(x, cy - h * 2, wCourse, h); box(x + wCourse, cy - h * 2, wDate, h);
    text(input.planName, x + 8, cy - h * 2 + 8, 10);
    text(slashDate(input.startDate) || input.appliedOn, x + wCourse + 8, cy - h * 2 + 8, 10);
  }

  // ===== 署名
  if (input.signatureDataUrl?.startsWith("data:image/png;base64,")) {
    try {
      const png = await doc.embedPng(Buffer.from(input.signatureDataUrl.split(",")[1] ?? "", "base64"));
      const maxW = 240, maxH = 70;
      const scale = Math.min(maxW / png.width, maxH / png.height, 1);
      page.drawImage(png, { x: 560, y: 78, width: png.width * scale, height: png.height * scale });
    } catch (e) {
      console.error("[frank-join-pdf] signature embed failed:", e);
    }
  }
  page.drawLine({ start: { x: 520, y: 70 }, end: { x: 820, y: 70 }, thickness: 0.8, color: LINE });
  text("サイン（電子署名）", 520, 56, 8);

  // ===== 店舗情報
  text("FRANK GOLF", 40, 96, 12);
  text("兵庫県姫路市土山6-6-1", 40, 78, 9.5);
  text("https://frankgolf.jp", 40, 62, 9.5);
  text("運営: 株式会社YOZAN", 40, 46, 9);

  return doc.save();
}
