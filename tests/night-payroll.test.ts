import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultRuleSet,
  calcItemBack,
  calcSlipTotals,
  calcDailyPay,
  calcMonthlyPayroll,
  findBottleTier,
  itemNeedsCast,
  type SlipItemInput,
} from "../packages/core/src/night-payroll.ts";

/* ============================================================
   ナイトの給与計算（Night OS / 2026-09-09）

   ここで固定しているのは、UIデザイン案で店長・キャストに見せた金額そのもの。
   画面の数字と計算結果がズレたらキャストは店を信用しないので、
   「デザインで約束した金額」を回帰テストにしている。
   ============================================================ */

const rules = defaultRuleSet("cabaret");
const MIO = "cast-mio";

test("A-3の伝票: 小計61,800 → サービス料20% → 税10% → お会計81,576", () => {
  const items: SlipItemInput[] = [
    { kind: "set", amount: 22000, qty: 2, castId: null },
    { kind: "nomination", amount: 5500, qty: 1, castId: MIO },
    { kind: "douhan", amount: 3300, qty: 1, castId: MIO },
    { kind: "cast_drink", amount: 3000, qty: 2, castId: MIO, drinkRuleId: "house" },
    { kind: "bottle", amount: 28000, qty: 1, castId: MIO },
  ];
  const t = calcSlipTotals(rules, items);
  assert.equal(t.subtotal, 61800);
  assert.equal(t.serviceCharge, 12360);
  assert.equal(t.tax, 7416);
  assert.equal(t.total, 81576);
});

test("取り消した明細はお会計にもバックにも入らない", () => {
  const items: SlipItemInput[] = [
    { kind: "set", amount: 22000, qty: 2, castId: null },
    { kind: "bottle", amount: 28000, qty: 1, castId: MIO, status: "void" },
  ];
  assert.equal(calcSlipTotals(rules, items).subtotal, 22000);
  assert.equal(calcItemBack(rules, items[1]).amount, 0);
});

test("担当キャストが入っていない行はバック0（誰にも付かない）", () => {
  const r = calcItemBack(rules, { kind: "cast_drink", amount: 1500, qty: 1, castId: null, drinkRuleId: "house" });
  assert.equal(r.amount, 0);
  assert.equal(r.basis, null);
});

test("ボトルの価格帯は min以上・max未満で1本に決まる（境界の二重取りが無い）", () => {
  assert.equal(findBottleTier(rules, 29999)?.percent, 20);
  assert.equal(findBottleTier(rules, 30000)?.percent, 25);
  assert.equal(findBottleTier(rules, 99999)?.percent, 25);
  assert.equal(findBottleTier(rules, 100000)?.percent, 30);
  assert.equal(findBottleTier(rules, 1000000)?.percent, 30);
});

test("みおさんの9/9の日当は37,200円（キャスト画面・オーナー画面と一致）", () => {
  const items: SlipItemInput[] = [
    { kind: "nomination", amount: 11000, qty: 2, castId: MIO },
    { kind: "inhouse_nomination", amount: 3300, qty: 1, castId: MIO },
    { kind: "douhan", amount: 3300, qty: 1, castId: MIO },
    { kind: "cast_drink", amount: 6000, qty: 4, castId: MIO, drinkRuleId: "house" },
    { kind: "bottle", amount: 28000, qty: 1, castId: MIO },
  ];
  const pay = calcDailyPay(rules, {
    baseHourlyWage: 3000,
    minutes: 360,
    items,
    broughtCustomer: true,
  });

  assert.equal(pay.hourly.applied, 3600, "同伴で時給+20%");
  assert.equal(pay.hourlyPay, 21600);
  assert.equal(pay.backTotal, 8000 + 3000 + 5600, "指名同伴8,000＋ドリンク3,000＋シャンパン5,600");
  assert.equal(pay.deductionTotal, 1000, "送り代");
  assert.equal(pay.net, 37200);
});

test("バック設定のシミュレーション（9/8・5.5時間）は38,050円", () => {
  const items: SlipItemInput[] = [
    { kind: "nomination", amount: 5500, qty: 1, castId: MIO },
    { kind: "inhouse_nomination", amount: 6600, qty: 2, castId: MIO },
    { kind: "douhan", amount: 3300, qty: 1, castId: MIO },
    { kind: "cast_drink", amount: 4500, qty: 3, castId: MIO, drinkRuleId: "house" },
    { kind: "bottle", amount: 40000, qty: 1, castId: MIO },
  ];
  const pay = calcDailyPay(rules, { baseHourlyWage: 3000, minutes: 330, items, broughtCustomer: true });
  assert.equal(pay.hourlyPay, 19800);
  assert.equal(pay.backTotal, 7000 + 2250 + 10000);
  assert.equal(pay.net, 38050);
});

test("%と円が両方当たっても、%が円に掛からない", () => {
  // 同伴(+20%) と 本指名3本(+500円) が同じ日に当たるケース
  const items: SlipItemInput[] = [{ kind: "nomination", amount: 16500, qty: 3, castId: MIO }];
  const pay = calcDailyPay(rules, { baseHourlyWage: 3000, minutes: 60, items, broughtCustomer: true });
  assert.equal(pay.hourly.applied, 3600 + 500, "3000×1.2=3600 に +500。3500×1.2 ではない");
});

test("時給アップの条件に当たらなければ素の時給のまま", () => {
  const pay = calcDailyPay(rules, { baseHourlyWage: 3000, minutes: 300, items: [], broughtCustomer: false });
  assert.equal(pay.hourly.applied, 3000);
  assert.equal(pay.hourlyPay, 15000);
  assert.equal(pay.net, 15000 - 1000);
});

test("月次: 20日以上出たら皆勤手当が付き、日払いは支給から引かれる", () => {
  const day = calcDailyPay(rules, {
    baseHourlyWage: 3000,
    minutes: 360,
    items: [{ kind: "nomination", amount: 5500, qty: 1, castId: MIO }],
    broughtCustomer: false,
  });
  const days = Array.from({ length: 22 }, (_, i) => ({
    businessDate: `2026-08-${String(i + 1).padStart(2, "0")}`,
    pay: day,
  }));

  const line = calcMonthlyPayroll(rules, { days, advanceTotal: 100000 });
  assert.equal(line.workDays, 22);
  assert.equal(line.allowanceTotal, 20000, "皆勤手当");
  assert.equal(line.hourlyTotal, 18000 * 22);
  assert.equal(line.backTotal, 2000 * 22);
  assert.equal(line.deductionTotal, 1000 * 22);
  assert.equal(line.gross, 18000 * 22 + 2000 * 22 - 1000 * 22 + 20000);
  assert.equal(line.net, line.gross - 100000);
  assert.equal(line.needsReview, false);
});

test("日払いが支給を超えたらマイナスになり、要確認として上がる", () => {
  const day = calcDailyPay(rules, { baseHourlyWage: 2500, minutes: 240, items: [], broughtCustomer: false });
  const days = Array.from({ length: 11 }, (_, i) => ({ businessDate: `2026-08-${i + 1}`, pay: day }));
  const line = calcMonthlyPayroll(rules, { days, advanceTotal: 200000 });
  assert.ok(line.net < 0);
  assert.equal(line.needsReview, true);
});

test("出勤していない日には送り代を付けない", () => {
  const pay = calcDailyPay(rules, { baseHourlyWage: 3000, minutes: 0, items: [], broughtCustomer: false });
  assert.equal(pay.deductionTotal, 0);
  assert.equal(pay.net, 0);
});

test("担当キャストが要る種別はDBのapp.nite_item_needs_castと同じ", () => {
  for (const k of ["nomination", "inhouse_nomination", "douhan", "cast_drink", "bottle"] as const) {
    assert.equal(itemNeedsCast(k), true, k);
  }
  for (const k of ["set", "extend", "food", "other"] as const) {
    assert.equal(itemNeedsCast(k), false, k);
  }
});

test("ラウンジのプリセットは指名バックが小さく、ドリンク中心になっている", () => {
  const lounge = defaultRuleSet("lounge");
  assert.equal(lounge.businessType, "lounge");
  assert.ok(lounge.nominationBack.nomination < rules.nominationBack.nomination);
  assert.equal(lounge.upliftRules.find((r) => r.id === "brought")?.effect.value, 10);
});
