import { test } from "node:test";
import assert from "node:assert/strict";
import {
  templatesForStore, templatesForStores, timeOffIndex, eachDate, validateTimeOff,
  type ScopedTemplate,
} from "../apps/shift-cloud/src/lib/shift-scope.ts";

/**
 * シフト提出の改善（DECISIONS #131）で守りたいこと:
 *   ① GOLF WING の 11:00-20:00 が FRANK GOLF の画面に出ない
 *   ② 休み希望は期間で入れても、シフト作成画面では1日ずつ引ける
 */

const GW = "store-golfwing";
const FRANK = "store-frank";

function tmpl(over: Partial<ScopedTemplate>): ScopedTemplate {
  return {
    id: "t", name: "終日", start_time: "11:00", end_time: "20:00",
    is_day_off: false, color: "#000", scope_type: "company", scope_id: null, ...over,
  };
}

test("店舗別テンプレは他店舗に出さない", () => {
  const list = [
    tmpl({ id: "gw", name: "終日", scope_type: "store", scope_id: GW }),
    tmpl({ id: "fr", name: "FRANK早番", scope_type: "store", scope_id: FRANK }),
    tmpl({ id: "off", name: "休み", is_day_off: true, scope_type: "company", scope_id: null }),
  ];
  assert.deepEqual(templatesForStore(list, FRANK).map((t) => t.id), ["fr", "off"]);
  assert.deepEqual(templatesForStore(list, GW).map((t) => t.id), ["gw", "off"]);
});

test("scope未設定（旧データ）は全店共通あつかい", () => {
  const list = [tmpl({ id: "legacy", scope_type: null, scope_id: null })];
  assert.equal(templatesForStore(list, FRANK).length, 1);
});

test("店舗が選ばれていないときは店舗別テンプレを出さない", () => {
  const list = [tmpl({ id: "gw", scope_type: "store", scope_id: GW })];
  assert.equal(templatesForStore(list, null).length, 0);
});

test("複数店舗に所属するスタッフは両方のテンプレが見える", () => {
  const list = [
    tmpl({ id: "gw", scope_type: "store", scope_id: GW }),
    tmpl({ id: "fr", scope_type: "store", scope_id: FRANK }),
    tmpl({ id: "other", scope_type: "store", scope_id: "store-x" }),
  ];
  assert.deepEqual(templatesForStores(list, [GW, FRANK]).map((t) => t.id), ["gw", "fr"]);
});

test("休み希望の期間は1日ずつ引ける", () => {
  const idx = timeOffIndex([
    { staff_id: "s1", start_date: "2026-12-29", end_date: "2027-01-03", status: "approved", reason: "帰省" },
  ]);
  assert.equal(idx.get("s1|2026-12-31")?.status, "approved");
  assert.equal(idx.get("s1|2027-01-03")?.status, "approved");
  assert.equal(idx.get("s1|2027-01-04"), undefined);
});

test("同じ日に申請中と承認済みが重なったら承認済みが勝つ", () => {
  const idx = timeOffIndex([
    { staff_id: "s1", start_date: "2026-09-01", end_date: "2026-09-05", status: "submitted", reason: null },
    { staff_id: "s1", start_date: "2026-09-03", end_date: "2026-09-03", status: "approved", reason: "有給" },
  ]);
  assert.equal(idx.get("s1|2026-09-03")?.status, "approved");
  assert.equal(idx.get("s1|2026-09-02")?.status, "submitted");
});

test("却下・取り下げは表示に出さない", () => {
  const idx = timeOffIndex([
    { staff_id: "s1", start_date: "2026-09-01", end_date: "2026-09-01", status: "rejected", reason: null },
    { staff_id: "s1", start_date: "2026-09-02", end_date: "2026-09-02", status: "withdrawn", reason: null },
  ]);
  assert.equal(idx.size, 0);
});

test("月をまたぐ日付計算がずれない", () => {
  assert.deepEqual(eachDate("2026-02-27", "2026-03-01"), ["2026-02-27", "2026-02-28", "2026-03-01"]);
  assert.equal(eachDate("2026-03-02", "2026-03-01").length, 0);
});

test("入力チェック", () => {
  const today = "2026-08-12";
  assert.equal(validateTimeOff("2026-12-29", "2027-01-03", today), null);
  assert.match(validateTimeOff("2026-12-29", "2026-12-01", today) ?? "", /終了日/);
  assert.match(validateTimeOff("2026-01-01", "2026-01-05", today) ?? "", /過去/);
  assert.match(validateTimeOff("2026-09-01", "2027-09-01", today) ?? "", /92日/);
  // 今日ちょうどは申請できる（当日の急な休みも入れられる）
  assert.equal(validateTimeOff(today, today, today), null);
});
