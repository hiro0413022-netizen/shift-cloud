import test from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_DAY,
  addMonthsYmd,
  calendarMonthsBetween,
  chargeDateForMonth,
  billedMonthOfChargeDate,
  nextChargeDateAfter,
  isChargeDate,
  monthLabel,
  nextBillingDateAfterPrepay,
  resolveBillingStartDate,
  usageStartSchedule,
  campaignFreeMonths,
  usageStartError,
  usageStartMaxYmd,
  rebaseStartDate,
} from "../packages/core/src/frank-billing-start.ts";

/* ============================================================
   月会費の引き落とし日（#235・2026-09-11 ユーザー決定）
     毎月10日に「翌月分」を引き落とす。全会員同じ日。
   入会時（#131・#234）
     無料＝ご利用開始月／前取り＝その翌月・翌々月／自動の引き落としはその次の月の分から

   早すぎ＝二重取り・遅すぎ＝取り損ね。式をここで固定する。
   ============================================================ */

test("addMonthsYmd: 毎月同日・末日の繰り下げ・年またぎ", () => {
  assert.equal(addMonthsYmd("2026-09-10", 3), "2026-12-10");
  assert.equal(addMonthsYmd("2026-08-31", 1), "2026-09-30");
  assert.equal(addMonthsYmd("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsYmd("2026-11-15", 3), "2027-02-15");
  assert.equal(addMonthsYmd("2027-01-01", -1), "2026-12-01");
});

test("引き落とし日は10日", () => {
  assert.equal(BILLING_DAY, 10);
  assert.equal(isChargeDate("2026-11-10"), true);
  assert.equal(isChargeDate("2026-11-11"), false);
});

test("その月の分は前月10日に引き落とす／引き落とし日は翌月の分", () => {
  assert.equal(chargeDateForMonth("2026-12-01"), "2026-11-10");
  assert.equal(chargeDateForMonth("2026-12-25"), "2026-11-10");
  assert.equal(chargeDateForMonth("2027-01-01"), "2026-12-10"); // 年またぎ
  assert.equal(billedMonthOfChargeDate("2026-11-10"), "2026-12-01");
  assert.equal(billedMonthOfChargeDate("2026-12-10"), "2027-01-01");
});

test("次に来る10日（当日は含まない）", () => {
  assert.equal(nextChargeDateAfter("2026-09-05"), "2026-09-10");
  assert.equal(nextChargeDateAfter("2026-09-10"), "2026-10-10");
  assert.equal(nextChargeDateAfter("2026-09-11"), "2026-10-10");
  assert.equal(nextChargeDateAfter("2026-12-31"), "2027-01-10");
});

test("9/11入会（開始日空欄）→ 9月無料・10月11月前取り・12月分を11/10に", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-09-11", prepaidMonths: 2 });
  assert.equal(monthLabel(s.freeMonthYmd), "9月");
  assert.deepEqual(s.prepaidMonthYmds.map(monthLabel), ["10月", "11月"]);
  assert.equal(s.firstBilledMonthYmd, "2026-12-01");
  assert.equal(s.nextBillingYmd, "2026-11-10");
  assert.equal(s.minTermUntilYmd, "2027-03-11");
});

test("入会日が月の前半でも後半でも、次回は同じ日（同じ条件で入った人は揃う）", () => {
  // キャンペーン前（〜9/25）に入会した方: 9月無料・10月11月前取り → 12月分を11/10
  for (const d of ["2026-09-01", "2026-09-10", "2026-09-11", "2026-09-25"]) {
    assert.equal(nextBillingDateAfterPrepay({ startDateYmd: d, prepaidMonths: 2 }), "2026-11-10", d);
  }
  // キャンペーン（9/26〜）で入会した方: 9月10月無料・11月12月前取り → 1月分を12/10
  for (const d of ["2026-09-26", "2026-09-30"]) {
    assert.equal(nextBillingDateAfterPrepay({ startDateYmd: d, prepaidMonths: 2 }), "2026-12-10", d);
  }
});

test("尾内様・大江様: 9/11入会・11/2開始 → 11月無料・12月1月前取り・2月分を1/10に・継続は5/2まで", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-09-11", usageStartYmd: "2026-11-02", prepaidMonths: 2 });
  assert.equal(s.deferredMonths, 2);
  assert.equal(monthLabel(s.freeMonthYmd), "11月");
  assert.deepEqual(s.prepaidMonthYmds.map(monthLabel), ["12月", "1月"]);
  assert.equal(s.firstBilledMonthYmd, "2027-02-01");
  assert.equal(s.nextBillingYmd, "2027-01-10");
  assert.equal(s.minTermUntilYmd, "2027-05-02");
});

test("中尾様（9/10入会・前取り2か月）→ 12月分を11/10に", () => {
  assert.equal(nextBillingDateAfterPrepay({ startDateYmd: "2026-09-10", prepaidMonths: 2 }), "2026-11-10");
});

test("FR0005（8/26入会）→ 11月分を10/10に", () => {
  assert.equal(nextBillingDateAfterPrepay({ startDateYmd: "2026-08-26", prepaidMonths: 2 }), "2026-10-10");
});

test("ご利用開始日が同じ月の後の日・過去日は入会月扱い", () => {
  for (const u of [null, "", "2026-09-11", "2026-09-30", "2026-08-01"]) {
    const s = usageStartSchedule({ applyDateYmd: "2026-09-11", usageStartYmd: u, prepaidMonths: 2 });
    assert.equal(s.deferredMonths, 0, String(u));
    assert.equal(s.nextBillingYmd, "2026-11-10", String(u));
  }
});

test("月末をまたぐ: 9/30入会・10/1開始 → 10月無料・11月12月前取り・1月分を12/10に", () => {
  assert.equal(calendarMonthsBetween("2026-09-30", "2026-10-01"), 1);
  const s = usageStartSchedule({ applyDateYmd: "2026-09-30", usageStartYmd: "2026-10-01", prepaidMonths: 2 });
  assert.equal(s.nextBillingYmd, "2026-12-10");
});

test("選べるご利用開始日は入会月から3か月後の月末まで。超えたら上限に丸める", () => {
  assert.equal(usageStartMaxYmd("2026-09-11"), "2026-12-31");
  assert.equal(usageStartMaxYmd("2026-11-30"), "2027-02-28");
  const s = usageStartSchedule({ applyDateYmd: "2026-09-11", usageStartYmd: "2027-06-01", prepaidMonths: 2 });
  assert.equal(s.usageStartYmd, "2026-12-31");
});

test("usageStartError: 空欄は通す／過去・上限超え・形式違いは文言を返す", () => {
  assert.equal(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "" }), null);
  assert.equal(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "2026-11-02" }), null);
  assert.match(String(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "2026-09-10" })), /本日以降/);
  assert.match(String(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "2027-01-01" })), /2026\/12\/31/);
  assert.match(String(usageStartError({ applyDateYmd: "2026-09-11", usageStartYmd: "11/2" })), /形式/);
});

test("#233 保存カードから立てる: 既定は入会完了メールと同じ日", () => {
  const r = resolveBillingStartDate({ startDateYmd: "2026-09-11", prepaidMonths: 2, usageStartYmd: "2026-11-02", todayYmd: "2026-09-11" });
  assert.equal(r.ok && r.date, "2027-01-10");
});

test("#233 スタッフ指定は10日だけ。10日以外は候補を返す", () => {
  const ok = resolveBillingStartDate({ startDateYmd: "2026-09-10", prepaidMonths: 2, todayYmd: "2026-09-11", requestedYmd: "2026-12-10" });
  assert.equal(ok.ok && ok.date, "2026-12-10");
  const ng = resolveBillingStartDate({ startDateYmd: "2026-09-10", prepaidMonths: 2, todayYmd: "2026-09-11", requestedYmd: "2026-12-05" });
  assert.equal(ng.ok, false);
  assert.equal(!ng.ok && ng.error, "not_billing_day");
  assert.equal(!ng.ok && ng.suggested, "2026-12-10");
});

test("#233 過去日は通さず、次に来る10日を候補にする", () => {
  const r = resolveBillingStartDate({ startDateYmd: "2026-09-10", prepaidMonths: 2, todayYmd: "2027-02-20" });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.error, "past_date");
  assert.equal(!r.ok && r.suggested, "2027-03-10");
});

test("既存会員の作り直し: 今いる会員（前取り2か月）の開始日", () => {
  const today = "2026-09-11";
  const cases: Array<[string, string | null, string]> = [
    // FR0005: #234 より前の入会は「入会月が無料」で決済済み。フォームの開始日(9/2)は使わない＝null で渡す
    ["2026-08-26", null, "2026-10-10"],
    ["2026-09-02", "2026-09-04", "2026-11-10"],
    ["2026-09-05", "2026-09-05", "2026-11-10"],
    ["2026-09-11", "2026-11-02", "2027-01-10"], // 尾内様・大江様
  ];
  for (const [join, start, want] of cases) {
    const r = rebaseStartDate({ joinDateYmd: join, usageStartYmd: start, prepaidMonths: 2, todayYmd: today });
    assert.equal(r.ok && r.date, want, `${join} ${start}`);
  }
});

test("既存会員の作り直し: 前取りの無いカード登録は、登録日の次の10日", () => {
  const r = rebaseStartDate({ joinDateYmd: "2026-08-01", prepaidMonths: 0, todayYmd: "2026-09-11", registeredYmd: "2026-09-11" });
  assert.equal(r.ok && r.date, "2026-10-10");
  assert.equal(r.ok && r.billedMonthYmd, "2026-11-01");
});

test("既存会員の作り直し: 開始日が今日以前になるなら止める（勝手に今日課金しない）", () => {
  const r = rebaseStartDate({ joinDateYmd: "2026-07-01", prepaidMonths: 2, todayYmd: "2026-09-11" });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.date, "2026-09-10");
});

/* ============================================================
   月会費無料キャンペーン（#280・年内まで／20日で自動切り替え）
   ユーザー指示:「毎月20日以降は当月＋翌月無料、20日までなら当月無料。
   この内容が20日を超えると自動で切り替わるように」
   ============================================================ */

test("20日までのご利用開始は1か月無料・21日以降は2か月無料", () => {
  // 20日は「20日まで」に入れる
  assert.equal(campaignFreeMonths("2026-10-20", "2026-10-20"), 1);
  assert.equal(campaignFreeMonths("2026-10-21", "2026-10-21"), 2);
  assert.equal(campaignFreeMonths("2026-10-01", "2026-10-01"), 1);
  assert.equal(campaignFreeMonths("2026-10-31", "2026-10-31"), 2);
});

test("月の前半に入会 → その月だけ無料・前取り2か月", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-10-05", prepaidMonths: 2 });
  assert.deepEqual(s.freeMonthYmds, ["2026-10-01"]);
  assert.deepEqual(s.prepaidMonthYmds, ["2026-11-01", "2026-12-01"]);
  assert.equal(s.nextBillingYmd, "2026-12-10"); // 1月分
});

test("月の後半に入会 → その月＋翌月が無料（残りが短いぶんを翌月で埋める）", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-10-25", prepaidMonths: 2 });
  assert.deepEqual(s.freeMonthYmds, ["2026-10-01", "2026-11-01"]);
  assert.deepEqual(s.prepaidMonthYmds, ["2026-12-01", "2027-01-01"]);
  assert.equal(s.nextBillingYmd, "2027-01-10"); // 2月分
});

test("9月下旬の入会は9月＋10月が無料（ユーザーの当初のご要望どおり）", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-09-26", prepaidMonths: 2 });
  assert.deepEqual(s.freeMonthYmds, ["2026-09-01", "2026-10-01"]);
  assert.equal(s.nextBillingYmd, "2026-12-10");
});

test("月をまたぐ境目で得の大きさが逆転しない（20日→21日→翌月1日）", () => {
  // 10/20は1か月（10月をあと11日使える）／10/21は2か月／11/1は1か月（11月を丸ごと）
  assert.equal(usageStartSchedule({ applyDateYmd: "2026-10-20", prepaidMonths: 2 }).freeMonthYmds.length, 1);
  assert.equal(usageStartSchedule({ applyDateYmd: "2026-10-21", prepaidMonths: 2 }).freeMonthYmds.length, 2);
  assert.equal(usageStartSchedule({ applyDateYmd: "2026-11-01", prepaidMonths: 2 }).freeMonthYmds.length, 1);
});

test("★ すでに入会済みの方に遡らない（設定済みのSquare課金とズレない）", () => {
  // 9月前半に入会された約40名。サブスクは「9月だけ無料」でもう立っている
  for (const d of ["2026-08-26", "2026-09-10", "2026-09-11", "2026-09-25"]) {
    const s = usageStartSchedule({ applyDateYmd: d, prepaidMonths: 2 });
    assert.equal(s.freeMonthYmds.length, 1, `${d} は無料1か月のまま`);
  }
  // 8/26 は日にちが26日だが、キャンペーン開始前なので2か月にならない
  assert.equal(campaignFreeMonths("2026-08-26", "2026-08-26"), 1);
});

test("年内までで終わる（年明けの入会は従来どおり1か月）", () => {
  assert.equal(campaignFreeMonths("2026-12-25", "2026-12-25"), 2);
  assert.equal(campaignFreeMonths("2026-12-31", "2026-12-31"), 2);
  assert.equal(campaignFreeMonths("2027-01-05", "2027-01-05"), 1);
  assert.equal(campaignFreeMonths("2027-01-25", "2027-01-25"), 1); // 25日でも付かない
  const s = usageStartSchedule({ applyDateYmd: "2027-01-25", prepaidMonths: 2 });
  assert.deepEqual(s.freeMonthYmds, ["2027-01-01"]);
});

test("判定はご利用開始日の日にち（先の月から使う方に翌月まで付けない）", () => {
  // 9/26入会でも、11/2から使うなら11月を丸ごと使えるので無料は11月だけ
  const s = usageStartSchedule({ applyDateYmd: "2026-09-26", usageStartYmd: "2026-11-02", prepaidMonths: 2 });
  assert.deepEqual(s.freeMonthYmds, ["2026-11-01"]);
  assert.deepEqual(s.prepaidMonthYmds, ["2026-12-01", "2027-01-01"]);
  // 逆に、ご利用開始日が21日以降なら翌月も付く
  const t = usageStartSchedule({ applyDateYmd: "2026-10-01", usageStartYmd: "2026-11-25", prepaidMonths: 2 });
  assert.deepEqual(t.freeMonthYmds, ["2026-11-01", "2026-12-01"]);
});

test("freeMonths を明示すれば従来の1か月に固定できる", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-10-25", prepaidMonths: 2, freeMonths: 1 });
  assert.deepEqual(s.freeMonthYmds, ["2026-10-01"]);
  assert.equal(s.nextBillingYmd, "2026-12-10");
});

test("freeMonthYmd は最初の無料月（既存の呼び出しが壊れない）", () => {
  const s = usageStartSchedule({ applyDateYmd: "2026-10-25", prepaidMonths: 2 });
  assert.equal(s.freeMonthYmd, "2026-10-01");
  assert.equal(s.freeMonthYmd, s.freeMonthYmds[0]);
});
