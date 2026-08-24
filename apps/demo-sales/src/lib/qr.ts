// QRコード生成 — qrcode-generator v2.0.4（MIT・Kazuhiko Arase 氏）を qr-vendor.ts として同梱。
// npm依存を増やさない（"QR Code"はデンソーウェーブの登録商標）。
// FAX・印刷で読めることを優先: 誤り訂正レベルM・余白4モジュール。

import qrcode from "./qr-vendor";

// vendorファイルは @ts-nocheck のため戻り値が {} に推論される。最小限の型を当てる
type QR = {
  addData(data: string, mode: "Byte"): void;
  make(): void;
  createSvgTag(opts: { cellSize?: number; margin?: number; scalable?: boolean }): string;
};
const createQr = qrcode as unknown as (typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H") => QR;

/** URLのQRコードをSVG文字列で返す（viewBoxのみのスケーラブルSVG。親要素の幅に追従する） */
export function qrSvg(text: string): string {
  const qr = createQr(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}
