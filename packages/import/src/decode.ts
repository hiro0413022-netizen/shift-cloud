// @yozan/import/decode — 取込ファイルの文字コード復号。
// decoderLabel は apps/money-golfwing/src/app/(main)/import/actions.ts からの切り出し。
// 銀行/カードCSVは Shift_JIS(cp932) が多く、素の TextDecoder はラベル "cp932" を解釈できない。

/** cp932/shift_jis 等のラベルをTextDecoderが解釈できる形へ */
export function decoderLabel(encoding?: string | null): string {
  const e = (encoding ?? "utf-8").toLowerCase();
  if (e === "cp932" || e === "windows-31j" || e === "ms932") return "shift_jis";
  return e;
}

/** バイト列→テキスト。encoding未指定はUTF-8。 */
export function decodeText(buf: ArrayBuffer | Uint8Array, encoding?: string | null): string {
  return new TextDecoder(decoderLabel(encoding)).decode(buf);
}
