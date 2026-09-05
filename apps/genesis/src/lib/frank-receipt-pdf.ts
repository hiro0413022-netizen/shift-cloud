import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { PDFDocument, rgb, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * FRANK GOLF 領収書PDF（#222・2026-09-05 ユーザー依頼「月会費の領収書を出したい」）
 *
 * ★ 紙の領収書をやめて電子交付にした理由
 *   5万円以上の領収書は紙だと収入印紙が要る（印紙税法）。**電子データで交付すれば課税文書にならない**
 *   ——法人の年払い（13万円台）でも印紙が要らない。iPadで表示・保存・メールのどれでも渡せる。
 *
 * ★ 金額は「実際に入金された税込金額」だけを載せる
 *   もとは mon_sales（Squareの入金Webhookが書いた行）。人が金額を打ち込む欄は作らない
 *   ＝**受け取っていない金額の領収書が作れない**。
 *
 * ★ 消費税は内税として内訳に出す（10%）。適格請求書の登録番号は未取得のため載せない
 *   （番号を持っていないのに「適格」の体裁にすると、受け取った側の控除で問題になる）。
 *
 * フォントは入会申込書PDF（#129）と同じ NotoSansJP。subset:true は使わない（グリフ欠落）。
 */

const LINE = rgb(0.45, 0.45, 0.45);
const TXT = rgb(0.1, 0.1, 0.1);
const DIM = rgb(0.4, 0.4, 0.4);

export type ReceiptItem = {
  /** 明細の名前（例: 月会費（レギュラー会員・2ヶ月分）） */
  label: string;
  /** 税込金額（円） */
  amount: number;
  /** 受領日 YYYY-MM-DD */
  soldOn?: string | null;
};

export type ReceiptInput = {
  /** 宛名（「様」「御中」まで入れて渡す） */
  toName: string;
  /** 但し書き（例: 月会費として） */
  note: string;
  items: ReceiptItem[];
  /** 発行日 YYYY-MM-DD */
  issuedOn: string;
  /** 会員番号（控えの照合用・空なら出さない） */
  memberNo?: string | null;
  /** 領収書番号（再発行の判別用） */
  receiptNo: string;
  /** お支払い方法（例: クレジットカード） */
  payMethod?: string | null;
};

const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;
const slash = (s?: string | null) => (s ? s.replaceAll("-", "/") : "");

export async function buildReceiptPdf(input: ReceiptInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = readFileSync(path.join(process.cwd(), "src/assets/NotoSansJP-Regular.ttf"));
  const font = await doc.embedFont(fontBytes);

  // A4縦（渡す・保存する前提なので縦）
  const page = doc.addPage([595, 842]);
  const W = 595;
  const total = input.items.reduce((n, i) => n + Math.round(i.amount), 0);
  // 内税10%（税込 → 消費税額）。端数は切り捨て（受領額を上回る税額を書かない）
  const tax = Math.floor((total * 10) / 110);

  const text = (s: string, x: number, y: number, size = 10, color = TXT, f: PDFFont = font) =>
    page.drawText(s ?? "", { x, y, size, font: f, color });
  const right = (s: string, xRight: number, y: number, size = 10, color = TXT) => {
    const w = font.widthOfTextAtSize(s, size);
    text(s, xRight - w, y, size, color);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, thickness = 0.8) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: LINE });

  // ===== タイトル
  {
    const t = "領　収　書";
    const w = font.widthOfTextAtSize(t, 24);
    text(t, (W - w) / 2, 770, 24);
  }
  right(`No. ${input.receiptNo}`, W - 45, 742, 9, DIM);
  right(`発行日 ${slash(input.issuedOn)}`, W - 45, 728, 10);

  // ===== 宛名
  text(input.toName, 45, 700, 16);
  line(45, 694, 330, 694, 1);

  // ===== 金額
  text("金額", 45, 655, 11, DIM);
  {
    const s = `¥ ${Math.round(total).toLocaleString("ja-JP")} -`;
    text(s, 100, 645, 26);
  }
  line(45, 636, W - 45, 636, 1.2);
  text(`（内 消費税10% ${yen(tax)}）`, 100, 618, 10, DIM);

  // ===== 但し書き
  text("但し", 45, 590, 11, DIM);
  text(input.note, 100, 590, 12);
  text("上記正に領収いたしました。", 45, 566, 11);

  // ===== 明細
  {
    let y = 528;
    text("内訳", 45, y + 16, 11, DIM);
    line(45, y + 10, W - 45, y + 10);
    for (const it of input.items) {
      text(`${slash(it.soldOn)}　${it.label}`, 50, y - 6, 10);
      right(yen(it.amount), W - 50, y - 6, 10);
      y -= 22;
      line(45, y + 10, W - 45, y + 10, 0.4);
      if (y < 300) break;
    }
    right(`合計　${yen(total)}`, W - 50, y - 8, 11);
    if (input.payMethod) text(`お支払い方法: ${input.payMethod}`, 50, y - 8, 10, DIM);
  }

  // ===== 発行者
  {
    const y = 210;
    line(320, y + 74, W - 45, y + 74, 0.6);
    text("株式会社YOZAN", 330, y + 52, 12);
    text("FRANK GOLF 姫路", 330, y + 36, 11);
    text("兵庫県姫路市土山6-6-1", 330, y + 20, 10, DIM);
    text("TEL 079-260-6671", 330, y + 4, 10, DIM);
    if (input.memberNo) text(`会員番号 ${input.memberNo}`, 45, y + 4, 10, DIM);
  }

  // ===== 注記（印紙・電子交付）
  text(
    "※ 本領収書は電子的に交付しているため、印紙税法上の課税文書に当たらず収入印紙は不要です。",
    45,
    120,
    9,
    DIM,
  );
  text("※ 再発行の場合も同じ番号で発行されます。二重のお支払いを証するものではありません。", 45, 106, 9, DIM);

  return await doc.save();
}
