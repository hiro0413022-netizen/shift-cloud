# Workforce OS — DATABASE

規約は `/docs/genesis/DATABASE_STANDARD.md`。共通カラム（id, company_id, created_at, updated_at, deleted_at）は省略して記載。

## 組織・人（Phase 1）

- `companies` — name, settings(jsonb: 丸めルール等)
- `brands` — name, company内ユニーク
- `stores` — brand_id, name, code, address, open_time, close_time, status
- `staff` — auth_user_id(uuid, nullable), name, name_kana, email(null可), login_id(null可), employment_type(enum: fulltime/parttime/contractor/lesson_pro), position, status(active/inactive), avatar_url
- `staff_store_assignments` — staff_id, store_id, is_primary
- `staff_wages` — staff_id, hourly_wage(int円), monthly_salary(int円, null可), commute_allowance(int円/日), effective_from(date)
- `roles` — name, permissions(jsonb: フラグ群), is_system
- `staff_roles` — staff_id, role_id, scope_type(company/brand/store), scope_id

## テンプレート・種別（Phase 1）

- `shift_templates` — name, start_time(time,null可), end_time(time,null可), is_day_off(bool), color, scope_type(company/brand/store), scope_id, sort_order
- `schedule_types` — name, category(work/leave/other), color, sort_order

## シフト（Phase 2–3）

- `shift_request_periods` — target_month(date), deadline(date), status(open/closed), store_id(null=全店)
- `shift_requests` — period_id, staff_id, date, template_id(null=休み等), memo, status(submitted/withdrawn)
- `shifts` — staff_id, store_id, date, start_time, end_time, template_id, schedule_type_id, status(draft/published), published_at, note

## 勤怠（Phase 4）

- `kiosk_devices` — store_id, name, token_hash, status
- `time_records` — staff_id, store_id, type(clock_in/clock_out/break_start/break_end), recorded_at, device_id, source(kiosk/admin/api), correction_of(自己参照, 修正時), correction_reason, corrected_by
- `attendance_days` — staff_id, store_id, date, shift_id, clock_in, clock_out, break_minutes, work_minutes, late_minutes, early_leave_minutes, overtime_minutes, is_missing_clock, status(auto/corrected/confirmed)

## 給与（Phase 5）

- `payroll_periods` — target_month, status(open/locked), locked_by, locked_at
- `payroll_items` — period_id, staff_id, work_minutes, overtime_minutes, base_amount, overtime_amount, commute_amount, allowance_amount, deduction_amount, total_amount, detail(jsonb)

## 運営・基盤（Phase 1–2, 6）

- `announcements` — title, body, scope_type, scope_id, publish_from, publish_to
- `store_events` — store_id, schedule_type_id(null可), title, date, start_time, end_time, note
- `notifications` — staff_id, kind, title, body, link, read_at
- `audit_logs` — actor_staff_id, actor_type(human/ai/system), action, table_name, record_id, before(jsonb), after(jsonb)  ※insertのみ
- `ai_suggestions` — AI_RULES.md参照
- `approval_requests` — kind(attendance_correction/leave/other), target_table, target_id, requested_by, status(pending/approved/rejected), decided_by, decided_at, payload(jsonb)
- `integration_configs` — kind(line/slack/n8n/api_key), config(jsonb), status
