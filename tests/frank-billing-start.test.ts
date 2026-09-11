import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonthsYmd,
  nextBillingDateAfterPrepay,
  resolveBillingStartDate,
  usageStartSchedule,
  usageStartError,
  usageStartMaxYmd,
  calendarMonthsBetween,
  monthLabel,
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

/* ============================================================
   ご利用開始月（#234・2026-09-11）

   尾内様（FR0048）・大江様（FR0049）: 9/11 入会・ご利用開始 11/2
   ユーザー決定: 無料＝ご利用開始月（11月）／前取り＝12月・1月（本日の21,560円を充当）
                 請求日は入会日と同じ11日のまま／6か月継続はご利用開始日から
   ============================================================ */

test("尾内様・大江様の実データ: 9/11入会・11/2開始 → 11月無料・12月1月前取り・次回 2027-02-11", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-09-11", usageStartYmd: "2026-11-02", prepaidMonths: 2 });
  assert.equal(s.deferredMonths, 2);
  assert.equal(s.pauseCycles, 4); // 10/11・11/11・12/11・1/11 を止める
  assert.equal(s.nextBillingYmd, "2027-02-11");
  assert.equal(monthLabel(s.freeMonthYmd), "11月");
  assert.deepEqual(s.prepaidMonthYmds.map(monthLabel), ["12月", "1月"]);
  assert.equal(s.minTermUntilYmd, "2027-05-02");
});

test("ご利用開始日が空欄・入会日と同じ・同じ月の後の日 → これまでと完全に同じ（止める周期2・次回3か月後）", () => {
  for (const u of [null, "", "2026-09-11", "2026-09-30"]) {
    const s = usageStartSchedule({ applyDateYmd: "2026-09-11", usageStartYmd: u, prepaidMonths: 2 });
    assert.equal(s.deferredMonths, 0, String(u));
    assert.equal(s.pauseCycles, 2, String(u));
    assert.equal(s.nextBillingYmd, "2026-12-11", String(u));
    assert.equal(monthLabel(s.freeMonthYmd), "9月");
  }
  // 継続期限は空欄なら入会日から（これまでの addMonthsYmd(today, 6) と同じ）
  assert.equal(usageStartSchedule({ applyDateYmd: "2026-09-11", prepaidMonths: 2 }).minTermUntilYmd, "2027-03-11");
});

test("過去日のご利用開始日は入会日に丸める（止める周期を減らさない＝二重取りしない）", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-09-11", usageStartYmd: "2026-08-01", prepaidMonths: 2 });
  assert.equal(s.usageStartYmd, "2026-09-11");
  assert.equal(s.pauseCycles, 2);
});

test("月末をまたぐ: 9/30入会・10/1開始は1か月ずれる", () => {
  assert.equal(calendarMonthsBetween("2026-09-30", "2026-10-01"), 1);
  const s = usageStartSchedule({ applyDateYmd: "2026-09-30", usageStartYmd: "2026-10-01", prepaidMonths: 2 });
  assert.equal(s.pauseCycles, 3);
  assert.equal(s.nextBillingYmd, "2027-01-30");
});

test("年をまたぐ: 12/20入会・2/1開始", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-12-20", usageStartYmd: "2027-02-01", prepaidMonths: 2 });
  assert.equal(s.deferredMonths, 2);
  assert.equal(s.nextBillingYmd, "2027-05-20");
  assert.deepEqual(s.prepaidMonthYmds, ["2027-03-01", "2027-04-01"]);
});

test("選べるのは入会月から3か月後の月の末日まで。超えた分は上限に丸める", () => {
  assert.equal(usageStartMaxYmd("2026-09-11"), "2026-12-31");
  assert.equal(usageStartMaxYmd("2026-11-30"), "2027-02-28");
  const s = usageStartSchedule({ applyDateYmd: "2026-09-11", usageStartYmd: "2027-06-01", prepaidMonths: 2 });
  assert.equal(s.usageStartYmd, "2026-12-31");
  assert.equal(s.deferredMonths, 3);
});

test("usageStartError: 空欄は通す／過去・上限超え・形式違いは文言を返す", () => {
  assert.equal(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "" }), null);
  assert.equal(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: null }), null);
  assert.equal(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "2026-11-02" }), null);
  assert.equal(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "2026-12-31" }), null);
  assert.match(String(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "2026-09-10" })), /本日以降/);
  assert.match(String(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "2027-01-01" })), /2026\/12\/31/);
  assert.match(String(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "11/2" })), /形式/);
});

test("#233 の自動課金の開始日もご利用開始日を見る（入会完了メールと同じ日付）", () => {
  assert.equal(
    nextBillingDateAfterPrepay({ startDateYmd: "2026-09-11", prepaidMonths: 2, usageStartYmd: "2026-11-02" }),
    "2027-02-11",
  );
  const r = resolveBillingStartDate({
    startDateYmd: "2026-09-11",
    prepaidMonths: 2,
    usageStartYmd: "2026-11-02",
    todayYmd: "2026-09-11",
  });
  assert.equal(r.ok && r.date, "2027-02-11");
});
