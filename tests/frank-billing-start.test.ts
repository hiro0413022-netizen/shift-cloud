import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonthsYmd,
  nextBillingDateAfterPrepay,
  resolveBillingStartDate,
} from "../packages/core/src/frank-billing-start.ts";

/* ============================================================
   自動課金を「あとから」立てるときの開始日（#233・2026-09-10）

   中尾様（FR0047）: 3Dセキュアのワンタイムパスワードが受け取れず決済リンクを完走できない
   → 店でカードを保存し、前取り分（10月分・11月分）は一回きりの決済で受領
   → サブスクだけを後から立てる

   早すぎる開始日 = 前取りした月をもう一度請求（二重取り）
   遅すぎる開始日 = その月をタダにする（取り損ね）
   どちらもそのままお金の事故なので、式をここで固定する。
   ============================================================ */

test("addMonthsYmd: 毎月同日", () => {
  assert.equal(addMonthsYmd("2026-09-10", 3), "2026-12-10");
  assert.equal(addMonthsYmd("2026-09-10", 0), "2026-09-10");
});

test("addMonthsYmd: 末日は繰り下げる（8/31 + 1か月 = 9/30）", () => {
  assert.equal(addMonthsYmd("2026-08-31", 1), "2026-09-30");
  assert.equal(addMonthsYmd("2026-01-31", 1), "2026-02-28");
});

test("addMonthsYmd: 年をまたぐ", () => {
  assert.equal(addMonthsYmd("2026-11-15", 3), "2027-02-15");
});

test("中尾様の実データ: 9/10入会・前取り2か月 → 次回は12/10", () => {
  assert.equal(nextBillingDateAfterPrepay({ startDateYmd: "2026-09-10", prepaidMonths: 2 }), "2026-12-10");
});

test("前取り0か月（カード登録だけの方）なら翌月同日", () => {
  assert.equal(nextBillingDateAfterPrepay({ startDateYmd: "2026-09-10", prepaidMonths: 0 }), "2026-10-10");
});

test("既定の開始日は入会完了メールが案内した日付と一致する", () => {
  const r = resolveBillingStartDate({
    startDateYmd: "2026-09-10",
    prepaidMonths: 2,
    todayYmd: "2026-09-10",
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.date, "2026-12-10");
});

test("スタッフが日付を指定したらそれを使う", () => {
  const r = resolveBillingStartDate({
    startDateYmd: "2026-09-10",
    prepaidMonths: 2,
    todayYmd: "2026-09-10",
    requestedYmd: "2027-01-01",
  });
  assert.equal(r.ok && r.date, "2027-01-01");
});

test("過去日は通さない。次に来る同日を候補として返す（勝手に今日課金しない）", () => {
  const r = resolveBillingStartDate({
    startDateYmd: "2026-09-10",
    prepaidMonths: 2,
    todayYmd: "2027-02-20", // 12/10・1/10 を取りこぼしたまま気づいた
  });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.error, "past_date");
  assert.equal(!r.ok && r.suggested, "2027-03-10");
});

test("今日ちょうどの開始日は通す（境界）", () => {
  const r = resolveBillingStartDate({
    startDateYmd: "2026-09-10",
    prepaidMonths: 2,
    todayYmd: "2026-12-10",
  });
  assert.equal(r.ok && r.date, "2026-12-10");
});

test("壊れた前取り月数（NaN・負）は0か月として扱う", () => {
  assert.equal(nextBillingDateAfterPrepay({ startDateYmd: "2026-09-10", prepaidMonths: NaN }), "2026-10-10");
  assert.equal(nextBillingDateAfterPrepay({ startDateYmd: "2026-09-10", prepaidMonths: -3 }), "2026-10-10");
});
