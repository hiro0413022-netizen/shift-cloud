import test from "node:test";
import assert from "node:assert/strict";
import {
  planIsBillable,
  isBillableMember,
  notBillableReason,
  countBillable,
  matchesBillableFilter,
  planLookup,
} from "../packages/core/src/frank-billable.ts";

/* ============================================================
   FRANK会員の「課金対象」判定（#273・2026-09-24 ユーザー指示）

   実データ（2026-09-24 時点の在籍）:
     ライト6 / レギュラー20 / マスター1 / 法人契約者1  = 28 ← いただいている人数
     スタッフ6 / モニター1 / 法人のご利用者23         = 30 ← 数えてはいけない
   見出しは 58 と出ていた。
   ============================================================ */

const PLANS = [
  { id: "light", name: "ライト会員", monthly_price: 9800, billable: true },
  { id: "regular", name: "レギュラー会員", monthly_price: 13800, billable: true },
  { id: "corp", name: "法人プレミアムプラン", monthly_price: 59800, billable: true },
  { id: "staff", name: "スタッフ", monthly_price: 0, billable: false },
  { id: "monitor", name: "モニター会員", monthly_price: 0, billable: false },
  { id: "test", name: "テスト会員", monthly_price: 100, billable: false },
];
const by = planLookup(PLANS);

test("月会費のあるプランの在籍会員は課金対象", () => {
  assert.equal(isBillableMember({ status: "active", plan_id: "light" }, by), true);
  // 休会は在籍。請求は止まるが「会員」ではあるので数える（内訳で休会◯名と出す）
  assert.equal(isBillableMember({ status: "suspended", plan_id: "regular" }, by), true);
});

test("スタッフ・モニター・テスト会員は数えない", () => {
  assert.equal(notBillableReason({ status: "active", plan_id: "staff" }, by), "free-plan");
  assert.equal(notBillableReason({ status: "active", plan_id: "monitor" }, by), "free-plan");
  // テスト会員は100円だが会員数には入れない＝billable列で落とす（金額の式では拾えない）
  assert.equal(notBillableReason({ status: "active", plan_id: "test" }, by), "free-plan");
});

test("法人のご利用者は数えない（請求は契約者の行にだけ立つ）", () => {
  assert.equal(
    notBillableReason({ status: "active", plan_id: "corp", corporate_parent_id: "boss" }, by),
    "corporate-user",
  );
  // 契約者ご本人は数える
  assert.equal(isBillableMember({ status: "active", plan_id: "corp", corporate_parent_id: null }, by), true);
});

test("退会・入会前は在籍していないので、課金対象にも課金対象外にも入れない", () => {
  for (const status of ["left", "pending", "rejected"]) {
    assert.equal(notBillableReason({ status, plan_id: "light" }, by), "not-enrolled");
    assert.equal(matchesBillableFilter({ status, plan_id: "light" }, "billable", by), false);
    assert.equal(matchesBillableFilter({ status, plan_id: "light" }, "excluded", by), false);
  }
});

test("プラン未設定は数えず、理由が分かる", () => {
  assert.equal(notBillableReason({ status: "active", plan_id: null }, by), "no-plan");
  assert.equal(notBillableReason({ status: "active", plan_id: "存在しないid" }, by), "no-plan");
});

test("billable列が無い古いプランは月会費>0で代替する", () => {
  assert.equal(planIsBillable({ id: "x", monthly_price: 9800 }), true);
  assert.equal(planIsBillable({ id: "x", monthly_price: 0 }), false);
  assert.equal(planIsBillable(null), false);
  // 列があるときは列が勝つ（0円でも課金対象にできる／100円でも外せる）
  assert.equal(planIsBillable({ id: "x", monthly_price: 100, billable: false }), false);
  assert.equal(planIsBillable({ id: "x", monthly_price: 0, billable: true }), true);
});

test("実データと同じ構成で 58 ではなく 28 と数える", () => {
  const members = [
    ...Array.from({ length: 6 }, () => ({ status: "active", plan_id: "light" })),
    ...Array.from({ length: 20 }, () => ({ status: "active", plan_id: "regular" })),
    { status: "active", plan_id: "corp" }, // 法人の契約者
    ...Array.from({ length: 23 }, () => ({ status: "active", plan_id: "corp", corporate_parent_id: "boss" })),
    ...Array.from({ length: 6 }, () => ({ status: "active", plan_id: "staff" })),
    { status: "active", plan_id: "monitor" },
    { status: "left", plan_id: "regular" }, // 退会者は内訳にも出さない
  ];
  // マスター1名ぶんを足して実データに合わせる
  members.push({ status: "active", plan_id: "regular" });

  const c = countBillable(members, by);
  assert.equal(c.billable, 28);
  assert.equal(c.excluded["corporate-user"], 23);
  assert.equal(c.excluded["free-plan"], 7);
  assert.equal(c.excluded["no-plan"], 0);
  assert.equal(c.suspended, 0);
  // 在籍の合計（57）＝課金対象28＋除外30 ではなく、退会1を抜いた数で必ず割り切れる
  assert.equal(c.billable + c.excluded["corporate-user"] + c.excluded["free-plan"], members.length - 1);
});

test("休会は課金対象に数えつつ、内訳で別に見える", () => {
  const c = countBillable(
    [
      { status: "active", plan_id: "light" },
      { status: "suspended", plan_id: "light" },
    ],
    by,
  );
  assert.equal(c.billable, 2);
  assert.equal(c.suspended, 1);
});

test("絞り込みは課金対象／課金対象外を取り違えない", () => {
  const staff = { status: "active", plan_id: "staff" };
  const light = { status: "active", plan_id: "light" };
  assert.equal(matchesBillableFilter(light, "billable", by), true);
  assert.equal(matchesBillableFilter(light, "excluded", by), false);
  assert.equal(matchesBillableFilter(staff, "excluded", by), true);
  assert.equal(matchesBillableFilter(staff, "billable", by), false);
  // 空＝絞らない（今までと同じ一覧）
  assert.equal(matchesBillableFilter(staff, "", by), true);
  assert.equal(matchesBillableFilter({ status: "left", plan_id: "light" }, "", by), true);
});
