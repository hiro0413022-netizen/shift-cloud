import test from "node:test";
import assert from "node:assert/strict";
import {
  parseManualSale,
  taxExcluded,
  manualSaleMemo,
  MANUAL_SALE_MAX,
  MANUAL_SALE_CATEGORIES,
  MANUAL_PAY_METHODS,
} from "../packages/core/src/frank-manual-sale.ts";

/* ============================================================
   現金・振込でお受けした分の記録（#278・2026-09-25）

   領収書は「記録された入金」からしか作れない（#222）。この決まりは変えず、
   お受けしたことを記録する入口を足した。だから「まだ受け取っていない」形は通さない。
   ============================================================ */

const TODAY = "2026-09-25";
const ok = (over: Record<string, unknown> = {}) =>
  parseManualSale({ amountIncTax: "13800", soldOn: TODAY, category: "月会費", payMethod: "現金", ...over }, TODAY);

test("税込から税抜への割り戻しは Square Webhook と同じ", () => {
  assert.equal(taxExcluded(13800), 12545);
  assert.equal(taxExcluded(11000), 10000);
  assert.equal(taxExcluded(1), 1);
});

test("ふつうの入力は通り、税抜も一緒に返る", () => {
  const r = ok();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.sale.amountIncTax, 13800);
  assert.equal(r.sale.amountExTax, 12545);
  assert.equal(r.sale.payMethod, "現金");
  assert.equal(r.sale.months, null);
});

test("カンマ入りの金額も受ける（店頭で「13,800」と打たれる）", () => {
  const r = ok({ amountIncTax: "13,800" });
  assert.equal(r.ok && r.sale.amountIncTax, 13800);
  const z = ok({ amountIncTax: "１3800" }); // 全角混じりは弾いてよい（数字として読めない）
  assert.equal(z.ok, false);
});

test("先の日付では記録できない（まだお受けしていない）", () => {
  const r = ok({ soldOn: "2026-09-26" });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /先の日付/);
  // 過去日は通る（あとから記録することはある）
  assert.equal(ok({ soldOn: "2026-09-01" }).ok, true);
  assert.equal(ok({ soldOn: TODAY }).ok, true);
});

test("0円・マイナス・桁の打ち間違いは弾く", () => {
  for (const v of ["0", "-1000", "", "abc"]) assert.equal(ok({ amountIncTax: v }).ok, false, String(v));
  assert.equal(ok({ amountIncTax: String(MANUAL_SALE_MAX) }).ok, true);
  const over = ok({ amountIncTax: String(MANUAL_SALE_MAX + 1) });
  assert.equal(over.ok, false);
  assert.match(!over.ok ? over.message : "", /大きすぎ/);
});

test("科目とお支払い方法は決まったものだけ", () => {
  for (const c of MANUAL_SALE_CATEGORIES) assert.equal(ok({ category: c }).ok, true, c);
  assert.equal(ok({ category: "寄付" }).ok, false);
  for (const m of MANUAL_PAY_METHODS) assert.equal(ok({ payMethod: m }).ok, true, m);
  // カードは Square が自動で書くので、手では記録させない（二重計上になる）
  assert.equal(ok({ payMethod: "カード" }).ok, false);
  assert.equal(ok({ payMethod: "Square" }).ok, false);
});

test("何ヶ月分は月会費のときだけ・2〜24の範囲", () => {
  assert.equal(ok({ months: "3" }).ok && (ok({ months: "3" }) as { sale: { months: number } }).sale.months, 3);
  assert.equal((ok({ months: "1" }) as { sale: { months: number | null } }).sale.months, null); // 1ヶ月は既定＝出さない
  assert.equal((ok({ months: "99" }) as { sale: { months: number | null } }).sale.months, null);
  assert.equal((ok({ category: "利用料", months: "3" }) as { sale: { months: number | null } }).sale.months, null);
});

test("台帳のメモに「誰が・どうお受けしたか」が残る", () => {
  const r = ok({ memo: "10月分" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const memo = manualSaleMemo(r.sale, "FR0001", "小川うらら");
  assert.match(memo, /FR0001/);
  assert.match(memo, /現金でお受けした分/);
  assert.match(memo, /記録: 小川うらら/);
  assert.match(memo, /10月分/);
  // 名前が無くても空にしない
  assert.match(manualSaleMemo(r.sale, null, ""), /記録: スタッフ/);
});

test("メモは長すぎたら切る（台帳の1行が崩れない）", () => {
  const r = ok({ memo: "あ".repeat(500) });
  assert.equal(r.ok && r.sale.memo?.length, 200);
});
