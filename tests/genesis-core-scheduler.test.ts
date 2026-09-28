// Genesis P2-a（#292）: Scheduler — ルール評価は ai_suggestions へ・cooldown・イベント処理・Waiting の期限
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRules, processEvents, nudgeWaiting, withJobRun } from "../packages/genesis-core/src/scheduler.ts";
import { createFakeAdmin } from "./fixtures/fake-admin.ts";

const C = "c1";
const rule = (over: Record<string, unknown>) => ({ id: "r1", company_id: C, code: "members_stale_90d", enabled: true, condition_sql: "select 1", severity: "warning", title_template: "{count}名が来ていません", body_template: "根拠", suggested_action: "フォロー", href: "/chat", schedule: "every_tick", cooldown_hours: 24, last_fired_at: null, ...over });

function adminWithRpc(rows: unknown[]) {
  const admin = createFakeAdmin({ gn_rules: [rule({})] });
  admin.rpc = async (name: string) => (name === "gn_chat_query" ? { data: rows, error: null } : { data: null, error: null });
  return admin;
}

test("ルール: 行が返れば ai_suggestions に1件（根拠つき）・同日は dedupe・cooldown 中は再評価しない", async () => {
  const admin = adminWithRpc([{ member_no: "1", member_name: "田中" }, { member_no: "2", member_name: "鈴木" }]);
  const now = new Date("2026-09-28T03:00:00Z");
  const r = await evaluateRules(admin, C, now);
  assert.deepEqual(r.fired, [{ code: "members_stale_90d", count: 2 }]);
  assert.equal(admin.tables.ai_suggestions.length, 1);
  assert.equal(admin.tables.ai_suggestions[0].title, "2名が来ていません");
  assert.match(String(admin.tables.ai_suggestions[0].body), /田中/);
  const r2 = await evaluateRules(admin, C, new Date("2026-09-28T04:00:00Z"));
  assert.equal(r2.evaluated, 0);
});

test("ルール: 0件なら起票しない・SQL エラーは last_error に残す", async () => {
  const admin = adminWithRpc([]);
  const r = await evaluateRules(admin, C, new Date("2026-09-28T03:00:00Z"));
  assert.deepEqual(r.fired, []);
  assert.equal(admin.tables.ai_suggestions?.length ?? 0, 0);
  const bad = createFakeAdmin({ gn_rules: [rule({})] });
  bad.rpc = async () => ({ data: null, error: { message: "boom" } });
  const rb = await evaluateRules(bad, C, new Date("2026-09-28T03:00:00Z"));
  assert.equal(rb.errors[0].error, "boom");
  assert.equal(bad.tables.gn_rules[0].last_error, "boom");
});

test("ルール: daily は JST 6時前には走らない・having 型は件数を読む", async () => {
  const admin = createFakeAdmin({ gn_rules: [rule({ schedule: "daily" })] });
  admin.rpc = async () => ({ data: [{ bookings: 7 }], error: null });
  assert.equal((await evaluateRules(admin, C, new Date("2026-09-27T19:00:00Z"))).evaluated, 0); // JST 4時
  const r = await evaluateRules(admin, C, new Date("2026-09-27T22:00:00Z")); // JST 7時
  assert.deepEqual(r.fired, [{ code: "members_stale_90d", count: 7 }]);
});

test("イベント処理: inquiry.replied で返事待ちが立ち、inquiry.received で閉じる。処理済みが付く", async () => {
  const admin = createFakeAdmin({ gn_events: [
    { id: "e1", company_id: C, type: "inquiry.replied", entity_kind: "inquiry", entity_id: "i1", payload: { from: "山田" }, occurred_at: "2026-09-28T00:00:00Z", processed_at: null, attempts: 0 },
  ] });
  const r = await processEvents(admin, C);
  assert.equal(r.handled, 1);
  assert.equal(admin.tables.gn_waiting.length, 1);
  assert.ok(admin.tables.gn_events[0].processed_at);
  admin.tables.gn_events.push({ id: "e2", company_id: C, type: "inquiry.received", entity_kind: "inquiry", entity_id: "i2", payload: { from: "山田" }, occurred_at: "2026-09-29T00:00:00Z", processed_at: null, attempts: 0 });
  await processEvents(admin, C);
  assert.equal(admin.tables.gn_waiting[0].status, "done");
});

test("Waiting: 期限切れは1日1回だけ「そろそろフォロー」を起票", async () => {
  const admin = createFakeAdmin({ gn_waiting: [{ id: "w1", company_id: C, status: "open", entity_label: "瀬戸口さん", what: "見積の返事", since: "2026-09-20T00:00:00Z", expected_by: "2026-09-25T00:00:00Z", nudged_at: null }] });
  const now = new Date("2026-09-28T03:00:00Z");
  assert.equal((await nudgeWaiting(admin, C, now)).nudged, 1);
  assert.match(String(admin.tables.ai_suggestions[0].title), /瀬戸口さんの見積の返事を待って8日/);
  assert.equal((await nudgeWaiting(admin, C, new Date("2026-09-28T09:00:00Z"))).nudged, 0);
});

test("job run: 成功も失敗も gn_job_runs に残る", async () => {
  const admin = createFakeAdmin();
  const ok = await withJobRun(admin, "t", C, async () => ({ n: 1 }));
  assert.equal(ok.ok, true);
  const ng = await withJobRun(admin, "t", C, async () => { throw new Error("x"); });
  assert.equal(ng.ok, false);
  assert.equal(admin.tables.gn_job_runs.length, 2);
  assert.equal(admin.tables.gn_job_runs[1].error, "x");
});
