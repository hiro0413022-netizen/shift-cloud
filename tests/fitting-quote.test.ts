// フィッティング見積の割引・返金計算の回帰テスト。実行: npm test
// craft-os — Excel「シャフト割引率」「見積のルール」「クラブ価格一覧」を写した式の固定。
// 式を変えたらここが落ちる。お客様に出した金額と食い違わせないための歯止め。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFittingRefund,
  computeLine,
  computeTotals,
  countClubs,
  normMaker,
  priceQuote,
  resolveDiscount,
  type DiscountRule,
} from "../packages/core/src/fitting-quote.ts";

/** golfwing.discount_rules に入れた初期値と同じ内容 */
const RULES: DiscountRule[] = [
  { item_category: "シャフト", segment: "visitor_or_intro", rate: 0.8, priority: 0 },
  { item_category: "シャフト", segment: "member_paid_fitting", rate: 0.7, priority: 0 },
  { item_category: "シャフト", segment: "from_demo_or_lesson", rate: 0.9, priority: 0 },
  { item_category: "シャフト", manufacturer: "REVE", segment: "visitor_or_intro", rate: 0.85, priority: 10 },
  { item_category: "シャフト", manufacturer: "REVE", segment: "member_paid_fitting", rate: 0.75, priority: 10 },
  { item_category: "シャフト", manufacturer: "REVE", segment: "from_demo_or_lesson", rate: 0.95, priority: 10 },
  { item_category: "シャフト", manufacturer: "ワクチンコンポ", segment: "visitor_or_intro", rate: 0.85, priority: 10 },
  { item_category: "シャフト", segment: "visitor_no_fitting", rate: 0.8, priority: 0 },
  { item_category: "シャフト", manufacturer: "REVE", segment: "visitor_no_fitting", rate: 0.85, priority: 10 },
  { item_category: "クラブ", member_kind: "会員", rate: 0.85, priority: 0 },
  { item_category: "クラブ", segment: "visitor_no_fitting", member_kind: "ビジター", rate: 1.0, priority: 0 },
  { item_category: "クラブ", segment: "visitor_or_intro", member_kind: "ビジター", rate: 0.8, priority: 5 },
  { item_category: "クラブ", segment: "from_demo_or_lesson", member_kind: "ビジター", rate: 0.8, priority: 5 },
  { item_category: "クラブ", segment: "member_paid_fitting", member_kind: "ビジター", rate: 0.8, priority: 5 },
  { item_category: "クラブ", manufacturer: "タイトリスト", member_kind: "会員", rate: 0.8, priority: 10 },
  { item_category: "クラブ", manufacturer: "COBRA", member_kind: "会員", rate: 0.9, priority: 10 },
  { item_category: "グリップ", member_kind: "会員", rate: 0.9, priority: 0 },
  { item_category: "グリップ", member_kind: "ビジター", rate: 1.0, priority: 0 },
  { item_category: "ハドラス", member_kind: "会員", rate: 0.9, priority: 0 },
  { item_category: "ハドラス", member_kind: "ビジター", rate: 1.0, priority: 0 },
  { item_category: "ボール", member_kind: "会員", rate: 0.9, priority: 0 },
  { item_category: "ボール", member_kind: "ビジター", rate: 1.0, priority: 0 },
  { item_category: "ボール", manufacturer: "タイトリスト", rate: 1.0, priority: 10 },
  { item_category: "工賃", rate: 1.0, priority: 0 },
  { item_category: "*", rate: 1.0, priority: -100 },
];

const at = { onDate: "2026-09-12" };

// ---------------------------------------------------------------------------
// 割引ルールの選択
// ---------------------------------------------------------------------------

test("シャフト: お客様区分で掛け率が変わる（割引率表が正・2026-09-12 ユーザー判断）", () => {
  const base = { itemCategory: "シャフト", manufacturer: "フジクラ", memberKind: "会員" as const, ...at };
  assert.equal(resolveDiscount(RULES, { ...base, segment: "visitor_or_intro" }).rate, 0.8);
  assert.equal(resolveDiscount(RULES, { ...base, segment: "member_paid_fitting" }).rate, 0.7);
  assert.equal(resolveDiscount(RULES, { ...base, segment: "from_demo_or_lesson" }).rate, 0.9);
});

test("シャフト: 会員でも「月会員10%OFF」にはならない（見積のルール側は不採用）", () => {
  const r = resolveDiscount(RULES, {
    itemCategory: "シャフト", manufacturer: "三菱ケミカル",
    memberKind: "会員", segment: "member_paid_fitting", ...at,
  });
  assert.equal(r.rate, 0.7);
  assert.notEqual(r.rate, 0.9);
});

test("シャフト: REVE・ワクチンコンポはメーカー指定の行が既定より優先される", () => {
  assert.equal(
    resolveDiscount(RULES, { itemCategory: "シャフト", manufacturer: "REVE", memberKind: "会員", segment: "member_paid_fitting", ...at }).rate,
    0.75,
  );
  assert.equal(
    resolveDiscount(RULES, { itemCategory: "シャフト", manufacturer: "ワクチンコンポ", memberKind: "ビジター", segment: "visitor_or_intro", ...at }).rate,
    0.85,
  );
});

test("メーカー名の表記ゆれ（trpx / TRPX、Arch / ARCH）を同じものとして扱う", () => {
  assert.equal(normMaker("trpx"), normMaker("TRPX"));
  assert.equal(normMaker("Arch"), normMaker("ARCH"));
  assert.equal(normMaker("UST マミヤ"), normMaker("USTマミヤ"));
  // REVE の行は小文字で書かれていても当たる
  assert.equal(
    resolveDiscount(RULES, { itemCategory: "シャフト", manufacturer: "reve", memberKind: "会員", segment: "visitor_or_intro", ...at }).rate,
    0.85,
  );
});

test("クラブ: 一見のビジターは割引なし。フィッティング歴あり・旧会員は20%OFF（2026-09-12 ユーザー判断）", () => {
  const v = { itemCategory: "クラブ", manufacturer: "PING", memberKind: "ビジター" as const, ...at };
  assert.equal(resolveDiscount(RULES, { ...v, segment: "visitor_no_fitting" }).rate, 1.0);
  assert.equal(resolveDiscount(RULES, { ...v, segment: "visitor_or_intro" }).rate, 0.8);
  assert.equal(resolveDiscount(RULES, { ...v, segment: "from_demo_or_lesson" }).rate, 0.8);
});

test("クラブ: 会員は0.85、タイトリスト0.80・COBRA0.90", () => {
  const m = { memberKind: "会員" as const, segment: "member_paid_fitting" as const, ...at };
  assert.equal(resolveDiscount(RULES, { itemCategory: "クラブ", manufacturer: "PING", ...m }).rate, 0.85);
  assert.equal(resolveDiscount(RULES, { itemCategory: "クラブ", manufacturer: "タイトリスト", ...m }).rate, 0.8);
  assert.equal(resolveDiscount(RULES, { itemCategory: "クラブ", manufacturer: "COBRA", ...m }).rate, 0.9);
});

test("ボール: タイトリストだけ割引なし、他メーカーは会員10%OFF（2026-09-12 ユーザー判断）", () => {
  const c = { memberKind: "会員" as const, segment: "member_paid_fitting" as const, ...at };
  assert.equal(resolveDiscount(RULES, { itemCategory: "ボール", manufacturer: "タイトリスト", ...c }).rate, 1);
  assert.equal(resolveDiscount(RULES, { itemCategory: "ボール", manufacturer: "ブリヂストン", ...c }).rate, 0.9);
  assert.equal(resolveDiscount(RULES, { itemCategory: "ボール", manufacturer: "ブリヂストン", ...c, memberKind: "ビジター" }).rate, 1);
});

test("工賃・未知のカテゴリは割引なし", () => {
  const c = { memberKind: "会員" as const, segment: "member_paid_fitting" as const, ...at };
  assert.equal(resolveDiscount(RULES, { itemCategory: "工賃", ...c }).rate, 1);
  assert.equal(resolveDiscount(RULES, { itemCategory: "キャディバッグ", ...c }).rate, 1);
});

test("スタッフ購入は仕入値（商品マスタの掛け率）で出す。ルール表は引かない", () => {
  const c = { memberKind: "スタッフ" as const, segment: "member_paid_fitting" as const, ...at };
  // シャフトの会員ルール（0.7）ではなく、渡した仕入掛け率が使われる
  const r = resolveDiscount(RULES, { itemCategory: "シャフト", manufacturer: "フジクラ", supplierRate: 0.6, ...c });
  assert.equal(r.rate, 0.6);
  assert.equal(r.rule, null);
  // 仕入掛け率が無い商品は割引せずに出す（手で直してもらう）
  assert.equal(resolveDiscount(RULES, { itemCategory: "シャフト", manufacturer: "フジクラ", ...c }).rate, 1);
});

test("期限切れのルールは使わない", () => {
  const rules: DiscountRule[] = [
    { item_category: "シャフト", segment: "visitor_or_intro", rate: 0.5, effective_to: "2026-08-31" },
    { item_category: "シャフト", segment: "visitor_or_intro", rate: 0.8, effective_from: "2026-09-01" },
  ];
  assert.equal(resolveDiscount(rules, { itemCategory: "シャフト", memberKind: "会員", segment: "visitor_or_intro", onDate: "2026-09-12" }).rate, 0.8);
  assert.equal(resolveDiscount(rules, { itemCategory: "シャフト", memberKind: "会員", segment: "visitor_or_intro", onDate: "2026-08-01" }).rate, 0.5);
});

// ---------------------------------------------------------------------------
// 明細1行
// ---------------------------------------------------------------------------

test("明細: 定価×掛け率で値引額と金額が出る", () => {
  // フィッティング料を払った会員が Tour AD DI-5 S（税抜45,000）を1本
  const l = computeLine({ listPrice: 45000, quantity: 1 }, 0.7);
  assert.equal(l.discountAmount, -13500);
  assert.equal(l.unitPrice, 31500);
  assert.equal(l.amount, 31500);
});

test("明細: 数量は単価にかかる", () => {
  const l = computeLine({ listPrice: 2000, quantity: 3 }, 0.9);
  assert.equal(l.discountAmount, -200);
  assert.equal(l.unitPrice, 1800);
  assert.equal(l.amount, 5400);
});

test("明細: 手入力の値引きは掛け率より優先され、rate は残さない", () => {
  const l = computeLine({ listPrice: 50000, quantity: 1, manualDiscountAmount: -20000 }, 0.8);
  assert.equal(l.discountAmount, -20000);
  assert.equal(l.unitPrice, 30000);
  assert.equal(l.rate, null);
});

// ---------------------------------------------------------------------------
// フィッティング料の返金
// ---------------------------------------------------------------------------

test("返金 110分: Excelの計算例①（FW1本＋UT2本 = 16,500円）", () => {
  const r = computeFittingRefund(110, { FW: 1, UT: 2 });
  assert.equal(r.rawAmount, 16500);
  assert.equal(r.amount, 16500);
  assert.equal(r.capped, false);
});

test("返金 110分: Excelの計算例②（FW2本＋UT2本 = 24,750 → 22,000で丸め）", () => {
  const r = computeFittingRefund(110, { FW: 2, UT: 2 });
  assert.equal(r.rawAmount, 24750);
  assert.equal(r.amount, 22000);
  assert.equal(r.capped, true);
});

test("返金 110分: 表の各行", () => {
  assert.equal(computeFittingRefund(110, { DR: 1 }).amount, 16500);
  assert.equal(computeFittingRefund(110, { DR: 1, FW: 1 }).amount, 22000);
  assert.equal(computeFittingRefund(110, { FW: 3 }).amount, 22000);
  assert.equal(computeFittingRefund(110, { FW: 2 }).amount, 16500);
  assert.equal(computeFittingRefund(110, { FW: 1 }).amount, 8250);
  assert.equal(computeFittingRefund(110, { UT: 3 }).amount, 11000);
  assert.equal(computeFittingRefund(110, { UT: 2 }).amount, 8250);
  assert.equal(computeFittingRefund(110, { UT: 1 }).amount, 0);
});

test("返金 55分: 表の各行と上限16,500", () => {
  assert.equal(computeFittingRefund(55, { DR: 1 }).amount, 16500);
  assert.equal(computeFittingRefund(55, { DR: 1, FW: 2, UT: 3 }).amount, 16500);
  assert.equal(computeFittingRefund(55, { FW: 2 }).amount, 16500);
  assert.equal(computeFittingRefund(55, { FW: 1 }).amount, 8250);
  assert.equal(computeFittingRefund(55, { UT: 3 }).amount, 11000);
  assert.equal(computeFittingRefund(55, { UT: 2 }).amount, 8250);
  assert.equal(computeFittingRefund(55, { UT: 1 }).amount, 0);
  // FW2本＋UT3本 = 16,500+11,000 = 27,500 → 上限16,500
  const r = computeFittingRefund(55, { FW: 2, UT: 3 });
  assert.equal(r.rawAmount, 27500);
  assert.equal(r.amount, 16500);
});

test("返金: フィッティング料のご利用が無ければ0、ご購入が無くても0", () => {
  assert.equal(computeFittingRefund(null, { DR: 1 }).amount, 0);
  assert.equal(computeFittingRefund(110, {}).amount, 0);
  assert.equal(computeFittingRefund(110, { DR: 0, FW: 0, UT: 0 }).amount, 0);
});

test("返金: 上限を1円たりとも超えない（総当たり）", () => {
  for (const m of [55, 110] as const) {
    for (let dr = 0; dr <= 4; dr += 1)
      for (let fw = 0; fw <= 4; fw += 1)
        for (let ut = 0; ut <= 4; ut += 1) {
          const r = computeFittingRefund(m, { DR: dr, FW: fw, UT: ut });
          assert.ok(r.amount <= r.cap, `${m}分 DR${dr}FW${fw}UT${ut} が上限超え`);
          assert.ok(r.amount >= 0);
        }
  }
});

test("本数は明細から数える（工賃・グリップ行は数えない）", () => {
  const c = countClubs([
    { club_type: "DR", quantity: 1, line_kind: "product" },
    { club_type: "FW", quantity: 2, line_kind: "product" },
    { club_type: "UT", quantity: 1, line_kind: "product" },
    { club_type: "DR", quantity: 1, line_kind: "labor" },   // 工賃行は対象外
    { club_type: null, quantity: 1, line_kind: "grip" },
  ]);
  assert.deepEqual(c, { DR: 1, FW: 2, UT: 1 });
});

// ---------------------------------------------------------------------------
// 合計
// ---------------------------------------------------------------------------

test("合計: 小計→消費税→税別品→返金・前受金を引く（切り捨て）", () => {
  const t = computeTotals({ amounts: [31500, 1800], taxRate: 0.1, taxFreeAmount: 0, refundAmount: 0, prepaidAmount: 0 });
  assert.equal(t.subtotal, 33300);
  assert.equal(t.tax, 3330);
  assert.equal(t.total, 36630);

  const t2 = computeTotals({ amounts: [31500], refundAmount: 16500 });
  assert.equal(t2.subtotal, 31500);
  assert.equal(t2.tax, 3150);
  assert.equal(t2.total, 31500 + 3150 - 16500);

  const t3 = computeTotals({ amounts: [10000], taxFreeAmount: 500, prepaidAmount: 3000 });
  assert.equal(t3.total, 10000 + 1000 + 500 - 3000);
});

// ---------------------------------------------------------------------------
// 通し（見積1件）
// ---------------------------------------------------------------------------

test("通し: フィッティング料を払った会員が DR1本＋FW1本＋グリップ2本を買う", () => {
  const items = [
    { line_kind: "product", item_category: "シャフト", manufacturer: "グラファイトデザイン", club_type: "DR", list_price: 45000, quantity: 1 },
    { line_kind: "product", item_category: "シャフト", manufacturer: "グラファイトデザイン", club_type: "FW", list_price: 45000, quantity: 1 },
    { line_kind: "grip",    item_category: "グリップ", manufacturer: "iomic", list_price: 2000, quantity: 2 },
    { line_kind: "labor",   item_category: "工賃", list_price: 500, quantity: 1 },
  ];
  const r = priceQuote(items, { segment: "member_paid_fitting", memberKind: "会員", fittingMinutes: 110, ...at }, RULES);

  assert.equal(r.items[0].amount, 31500);          // 45,000 × 0.7
  assert.equal(r.items[1].amount, 31500);
  assert.equal(r.items[2].amount, 3600);           // 2,000 × 0.9 × 2本
  assert.equal(r.items[3].amount, 500);            // 工賃は割引なし
  assert.deepEqual(r.clubCounts, { DR: 1, FW: 1, UT: 0 });
  assert.equal(r.refund.amount, 22000);            // ドライバーを含む2本以上
  assert.equal(r.totals.subtotal, 67100);
  assert.equal(r.totals.tax, 6710);
  assert.equal(r.totals.total, 67100 + 6710 - 22000);
});

test("通し: 一見のビジターがクラブを買うと割引なし", () => {
  const r = priceQuote(
    [{ line_kind: "product", item_category: "クラブ", manufacturer: "COBRA", club_type: "DR", list_price: 75000, quantity: 1 }],
    { segment: "visitor_no_fitting", memberKind: "ビジター", fittingMinutes: null, ...at },
    RULES,
  );
  assert.equal(r.items[0].discountAmount, 0);
  assert.equal(r.totals.total, 82500);
});

test("明細ごとに掛け率を打ち替えられる（人によって割引率が変わるため）", () => {
  const items = [
    // 既定なら一見のビジター＝割引なしだが、この方だけ15%OFFにする
    { line_kind: "product", item_category: "クラブ", manufacturer: "PING", club_type: "DR", list_price: 100000, quantity: 1,
      discount_manual: true, discount_rate: 0.85 },
  ];
  const r = priceQuote(items, { segment: "visitor_no_fitting", memberKind: "ビジター", fittingMinutes: null, ...at }, RULES);
  assert.equal(r.items[0].discountAmount, -15000);
  assert.equal(r.items[0].amount, 85000);
  assert.match(r.items[0].discountReason, /手で設定した掛け率/);
});

test("通し: スタッフ購入は仕入掛け率で計算される", () => {
  const r = priceQuote(
    [{ line_kind: "product", item_category: "シャフト", manufacturer: "フジクラ", club_type: "DR", list_price: 50000, quantity: 1, supplier_rate: 0.55 }],
    { segment: "member_paid_fitting", memberKind: "スタッフ", fittingMinutes: null, ...at },
    RULES,
  );
  assert.equal(r.items[0].amount, 27500);
  assert.match(r.items[0].discountReason, /スタッフ購入/);
});

// ---------------------------------------------------------------------------
// 返金の上限は「表紙ごと」に数える
// （2026-09-13 ユーザー判断：1回のフィッティングから見積を分けることがある。
//   分けても22,000円を二重に返さない）
// ---------------------------------------------------------------------------

test("返金の枠は表紙ごと: 1枚目16,500 → 2枚目は残り5,500までしか引けない", () => {
  const first = computeFittingRefund(110, { FW: 1, UT: 2 });
  assert.equal(first.amount, 16500);
  assert.equal(first.alreadyRefunded, 0);
  assert.equal(first.remaining, 22000);

  // 後日ドライバーを買った（単独なら16,500）が、枠はもう5,500しか残っていない
  const second = computeFittingRefund(110, { DR: 1 }, { alreadyRefunded: first.amount });
  assert.equal(second.entitled, 16500);
  assert.equal(second.remaining, 5500);
  assert.equal(second.amount, 5500);
  assert.equal(first.amount + second.amount, 22000);
});

test("返金の枠は表紙ごと: 使い切っていたら2枚目は0円", () => {
  const r = computeFittingRefund(110, { DR: 1, FW: 1 }, { alreadyRefunded: 22000 });
  assert.equal(r.entitled, 22000);
  assert.equal(r.remaining, 0);
  assert.equal(r.amount, 0);
});

test("返金の枠は表紙ごと: 55分の枠は16,500で数える", () => {
  const r = computeFittingRefund(55, { FW: 2 }, { alreadyRefunded: 8250 });
  assert.equal(r.cap, 16500);
  assert.equal(r.remaining, 8250);
  assert.equal(r.amount, 8250);
});

test("返金の枠は表紙ごと: 何枚に分けても合計が上限を超えない（総当たり）", () => {
  for (const m of [55, 110] as const) {
    for (let used = 0; used <= 22000; used += 2750) {
      for (let dr = 0; dr <= 2; dr += 1)
        for (let fw = 0; fw <= 3; fw += 1)
          for (let ut = 0; ut <= 3; ut += 1) {
            const r = computeFittingRefund(m, { DR: dr, FW: fw, UT: ut }, { alreadyRefunded: used });
            assert.ok(r.amount >= 0);
            assert.ok(
              used + r.amount <= r.cap || used > r.cap,
              `${m}分 既に${used}円 DR${dr}FW${fw}UT${ut} で枠超え`,
            );
          }
    }
  }
});

test("通し: priceQuote に refundAlreadyUsed を渡すと合計に効く", () => {
  const items = [
    { line_kind: "product", item_category: "クラブ", manufacturer: "PING", club_type: "DR", list_price: 100000, quantity: 1 },
  ];
  const base = { segment: "member_paid_fitting", memberKind: "会員", fittingMinutes: 110 } as const;
  const alone = priceQuote(items, { ...base }, RULES);
  const after = priceQuote(items, { ...base, refundAlreadyUsed: 16500 }, RULES);
  assert.equal(alone.refund.amount, 16500);
  assert.equal(after.refund.amount, 5500);
  assert.equal(after.totals.total, alone.totals.total + 11000);
});
