import test from "node:test";
import assert from "node:assert/strict";
import { validCoupon, planChangeProration, taxIncl, isJoinCampaignActive, joinEstimate } from "../apps/member-os/src/lib/frank-billing-pure.ts";
import { isJoiningFeeNote } from "../apps/genesis/src/lib/frank-pos-pure.ts";
import { joinInitialTotal } from "../apps/genesis/src/lib/frank-join-pure.ts";

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

// ===== 年内入会キャンペーン（#131） =====
test("キャンペーン判定: 2026-12-31まで適用・2027-01-01から対象外", () => {
  assert.equal(isJoinCampaignActive("2026-08-11"), true);
  assert.equal(isJoinCampaignActive("2026-12-31"), true);
  assert.equal(isJoinCampaignActive("2027-01-01"), false);
});

test("入会見積: キャンペーン中は入会金0・入会月0・2か月分前取り", () => {
  // レギュラー会員 13,800税抜 → 税込15,180。入会金5,000税抜 → 税込5,500
  const e = joinEstimate({ monthlyExTax: 13800, joiningFeeExTax: 5000, applyDateYmd: "2026-09-11" });
  assert.equal(e.campaign, true);
  assert.equal(e.joiningFeeTaxIncluded, 5500);
  assert.equal(e.joiningFeeCharged, 0);
  assert.equal(e.monthlyTaxIncluded, 15180);
  assert.equal(e.prepaidMonths, 2);
  assert.equal(e.totalDueNow, 30360); // 15,180×2
  assert.equal(e.minMonths, 6);
});

test("入会見積: キャンペーン後は入会金5,500円を請求（前取り2か月は継続）", () => {
  const e = joinEstimate({ monthlyExTax: 13800, joiningFeeExTax: 5000, applyDateYmd: "2027-01-05" });
  assert.equal(e.campaign, false);
  assert.equal(e.joiningFeeCharged, 5500);
  assert.equal(e.totalDueNow, 5500 + 15180 * 2);
  assert.equal(e.minMonths, 0);
});

// ===== 見積（member-os）と決済額（genesis）の一致（#131b） =====
// ここがズレると「見積と決済画面の金額が違う」事故になる。両実装を突き合わせて固定する。
test("見積と決済額が一致する（キャンペーン中/後・全プラン）", () => {
  const plans = [
    { monthly: 9800, fee: 5000 },   // ライト
    { monthly: 13800, fee: 5000 },  // レギュラー
    { monthly: 19800, fee: 5000 },  // マスター
    { monthly: 39800, fee: 5000 },  // 法人ライト
    { monthly: 59800, fee: 5000 },  // 法人プレミアム
  ];
  for (const day of ["2026-09-11", "2026-12-31", "2027-01-01"]) {
    for (const p of plans) {
      const est = joinEstimate({ monthlyExTax: p.monthly, joiningFeeExTax: p.fee, applyDateYmd: day });
      const pay = joinInitialTotal({ monthlyExTax: p.monthly, joiningFeeExTax: p.fee, applyDateYmd: day });
      assert.equal(pay.total, est.totalDueNow, `${day} ${p.monthly}`);
      assert.equal(pay.prepaidMonths, est.prepaidMonths);
      assert.equal(pay.joiningFee, est.joiningFeeCharged);
    }
  }
});

test("クーポン適用は入会金0＝決済額も前取り分のみ", () => {
  const pay = joinInitialTotal({ monthlyExTax: 13800, joiningFeeExTax: 5000, applyDateYmd: "2027-02-01", joiningFeeWaived: true });
  assert.equal(pay.joiningFee, 0);
  assert.equal(pay.total, 15180 * 2);
});
