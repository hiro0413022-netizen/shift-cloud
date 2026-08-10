import test from "node:test";
import assert from "node:assert/strict";
import { validCoupon, planChangeProration, taxIncl } from "../apps/member-os/src/lib/frank-billing-pure.ts";
import { isJoiningFeeNote } from "../apps/genesis/src/lib/frank-pos-pure.ts";

/* ============================================================
   FRANK GOLF 入会金・クーポン・プラン変更（#124）
   お金の計算と判定はネットワーク無しで固定する。
   ============================================================ */

test("クーポン: 6種のみ有効・大文字/空白は吸収・無効はnull", () => {
  for (const c of ["frankgolft", "fujita", "anada", "ogawa", "furukawa", "hayashi"]) {
    assert.equal(validCoupon(c), c);
  }
  assert.equal(validCoupon(" FUJITA "), "fujita"); // 大文字・空白OK
  assert.equal(validCoupon("frankgolf"), null); // 惜しくても弾く（正は frankgolft）
  assert.equal(validCoupon(""), null);
  assert.equal(validCoupon(null), null);
});

test("プラン変更の週割: レギュラー→マスター（差額6,600円税込→1,650円/週）", () => {
  // 差額: 21,780 - 15,180 = 6,600円税込 → 1週あたり1,650円
  const cases: Array<[number, number, number]> = [
    [3, 4, 6600], // 第1週(1-7日) → 4週分＝満額
    [10, 3, 4950], // 第2週(8-14日) → 3週分
    [21, 2, 3300], // 第3週(15-21日) → 2週分
    [22, 1, 1650], // 第4週(22日〜) → 1週分
    [31, 1, 1650], // 月末でも1週分
  ];
  for (const [day, weeks, charge] of cases) {
    const r = planChangeProration({ oldMonthlyExTax: 13800, newMonthlyExTax: 19800, jstDayOfMonth: day });
    assert.equal(r.weeks, weeks, `day=${day}`);
    assert.equal(r.chargeTaxIncluded, charge, `day=${day}`);
  }
});

test("プラン変更の週割: ダウングレードは請求0円（返金しない）", () => {
  const r = planChangeProration({ oldMonthlyExTax: 19800, newMonthlyExTax: 13800, jstDayOfMonth: 5 });
  assert.equal(r.chargeTaxIncluded, 0);
});

test("入会金: 税込11,000円・noteの接頭辞で入会金の入金と判定する", () => {
  assert.equal(taxIncl(10000), 11000);
  assert.equal(taxIncl(2000), 2200); // 休会費
  assert.equal(isJoiningFeeNote("FRANK入会金（FR0001）"), true);
  assert.equal(isJoiningFeeNote("Square: コーヒー"), false);
  assert.equal(isJoiningFeeNote(null), false);
});
