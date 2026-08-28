import test from "node:test";
import assert from "node:assert/strict";
import { ymdSlash, formatTel } from "../apps/member-os/src/lib/ledger-format.ts";

// 一時利用顧客名簿（Excel出力）の書式（#173）。
// 実データ（mbr_guests）に実在した崩れ方をそのままケースにしている。

test("ymdSlash: DBのdate列（YYYY-MM-DD）はスラッシュ区切りで出す", () => {
  assert.equal(ymdSlash("2026-08-28"), "2026/08/28");
  assert.equal(ymdSlash("1975-01-05"), "1975/01/05");
});

test("ymdSlash: 空・null・日付として読めないものは原文のまま", () => {
  assert.equal(ymdSlash(null), "");
  assert.equal(ymdSlash(undefined), "");
  assert.equal(ymdSlash(""), "");
  assert.equal(ymdSlash("未定"), "未定");
});

test("ymdSlash: 日時が来ても日付までで切る", () => {
  assert.equal(ymdSlash("2026-08-28T10:30:00+09:00"), "2026/08/28");
});

test("formatTel: すでに正しいハイフン区切りはそのまま（実データの大半）", () => {
  assert.equal(formatTel("090-1234-5678"), "090-1234-5678");
  assert.equal(formatTel("0797-81-1234"), "0797-81-1234");
  assert.equal(formatTel("06-6777-3679"), "06-6777-3679");
  assert.equal(formatTel("079-227-5106"), "079-227-5106");
});

test("formatTel: 数字だけの携帯11桁はハイフンを入れる", () => {
  assert.equal(formatTel("09012345678"), "090-1234-5678");
  assert.equal(formatTel("08099908700"), "080-9990-8700");
  assert.equal(formatTel("05012345678"), "050-1234-5678");
});

test("formatTel: 全角ハイフン・スペース区切り・+81 も直せる", () => {
  assert.equal(formatTel("090‐2806-0732"), "090-2806-0732"); // 全角ハイフン
  assert.equal(formatTel("090 9611 7054"), "090-9611-7054");
  assert.equal(formatTel("＋８１９０１２３４５６７８"), "090-1234-5678");
  assert.equal(formatTel("+818099908700"), "080-9990-8700");
});

test("formatTel: ハイフンの位置がおかしい携帯は入れ直す", () => {
  assert.equal(formatTel("0905129-9161"), "090-5129-9161");
  assert.equal(formatTel("090-78770399"), "090-7877-0399");
  assert.equal(formatTel("090-3866--9689"), "090-3866-9689");
});

test("formatTel: フリーダイヤル・03/06 の10桁も整形する", () => {
  assert.equal(formatTel("0120123456"), "0120-123-456");
  assert.equal(formatTel("0312345678"), "03-1234-5678");
  assert.equal(formatTel("0612345678"), "06-1234-5678");
});

test("formatTel: メモ書き・2件併記は絶対に壊さない（情報を落とさない）", () => {
  assert.equal(formatTel("090-4300-5336（母弘子様携帯"), "090-4300-5336（母弘子様携帯");
  assert.equal(formatTel("06-6777-3679・090-7112-3456"), "06-6777-3679・090-7112-3456");
  assert.equal(formatTel("079-227-5106/090-5151-2345"), "079-227-5106/090-5151-2345");
  assert.equal(formatTel("記載なし"), "記載なし");
});

test("formatTel: 桁数が合わないものは原文のまま（勝手に割らない）", () => {
  assert.equal(formatTel("-8530"), "-8530");
  assert.equal(formatTel("090-8653"), "090-8653");
  assert.equal(formatTel("090-50456-9130"), "090-50456-9130");
});

test("formatTel: 市外局番の切れ目が判らない固定電話10桁は触らない", () => {
  // 0797-81-1234 と 079-781-1234 はどちらも10桁。表がないと決められないので原文のまま
  assert.equal(formatTel("0797811234"), "0797811234");
});

test("formatTel: 空・null は空文字", () => {
  assert.equal(formatTel(null), "");
  assert.equal(formatTel(undefined), "");
  assert.equal(formatTel("   "), "");
});
