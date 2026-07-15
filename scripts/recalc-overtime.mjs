#!/usr/bin/env node
/**
 * 既存の attendance_days の残業（overtime_minutes）を新ルールで一括再計算する。DECISIONS #60
 *
 * 背景: 残業＝シフト終了超過だが、これまで生の退勤打刻で判定していたため、退勤が数分過ぎた
 *       だけで残業が付いていた（例: 退勤19:54・終了19:45→残業10分）。会社設定 rounding_minutes
 *       （GOLF WING=15）に合わせ、退勤を丸め単位に切り下げてからシフト終了と比べる（19:45→残業0）。
 *
 * ※再計算するのは overtime_minutes のみ。実働・遅刻・早退・休憩・給与額は触らない
 *   （丸めの適用範囲＝残業判定のみ、という決定に合わせる）。
 *
 * 使い方:
 *   node scripts/recalc-overtime.mjs            # dry-run（変わる行を表示するだけ）
 *   node scripts/recalc-overtime.mjs --apply    # 実際に overtime_minutes を更新
 *   （npm run recalc:overtime -- --apply でも可）
 *
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.slice(2).includes("--apply");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

/**
 * payroll-calc.ts の calcOvertimeMinutes の移植（このスクリプトは .ts を import しないため複製）。
 * 15分は9時間(JST offset)を割り切るので、絶対時刻での切り下げでJSTの:00/:15/:30/:45に揃う。
 */
function calcOvertimeMinutes(clockOutMs, shiftEndMs, roundingMinutes) {
  const grid = roundingMinutes > 0 ? roundingMinutes * 60000 : 0;
  const effectiveOut = grid > 0 ? Math.floor(clockOutMs / grid) * grid : clockOutMs;
  return Math.max(0, Math.round((effectiveOut - shiftEndMs) / 60000));
}

// 会社別の丸め幅
const { data: companies, error: cErr } = await db.from("companies").select("id, settings");
if (cErr) throw cErr;
const roundingOf = new Map(
  (companies ?? []).map((c) => [c.id, (c.settings ?? {}).rounding_minutes ?? 0])
);

// 残業対象＝確定シフトがあり退勤打刻がある日。shifts.end_time を結合して取得。
const { data: days, error: dErr } = await db
  .from("attendance_days")
  .select("id, company_id, staff_id, date, clock_out, overtime_minutes, shifts(end_time)")
  .not("shift_id", "is", null)
  .not("clock_out", "is", null);
if (dErr) throw dErr;

let changed = 0;
let unchanged = 0;
const updates = [];
for (const d of days ?? []) {
  const endTime = d.shifts?.end_time;
  if (!endTime) continue; // 終了時刻なし（休み等）は残業対象外
  const rounding = roundingOf.get(d.company_id) ?? 0;
  const clockOutMs = new Date(d.clock_out).getTime();
  const shiftEndMs = new Date(`${d.date}T${String(endTime).slice(0, 5)}:00+09:00`).getTime();
  const next = calcOvertimeMinutes(clockOutMs, shiftEndMs, rounding);
  if (next === d.overtime_minutes) {
    unchanged++;
    continue;
  }
  changed++;
  updates.push({ id: d.id, from: d.overtime_minutes, to: next });
}

console.log(`対象 ${(days ?? []).length}日 / 変化あり ${changed}件 / 変化なし ${unchanged}件`);
for (const u of updates.slice(0, 50)) {
  console.log(`  ${u.id}: 残業 ${u.from}分 → ${u.to}分`);
}
if (updates.length > 50) console.log(`  … 他 ${updates.length - 50}件`);

if (!APPLY) {
  console.log("\n[dry-run] 更新はしていません。--apply で反映します。");
  process.exit(0);
}

for (const u of updates) {
  const { error } = await db
    .from("attendance_days")
    .update({ overtime_minutes: u.to })
    .eq("id", u.id);
  if (error) {
    console.error(`更新失敗 ${u.id}: ${error.message}`);
    process.exit(1);
  }
}
console.log(`\n✅ ${updates.length}件の overtime_minutes を更新しました。`);
