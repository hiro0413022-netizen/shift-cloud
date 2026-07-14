# DATABASE STANDARD

## 命名

- テーブル: 複数形スネークケース（`shift_templates`）
- カラム: スネークケース。外部キーは`<単数形>_id`
- enum: `<対象>_<属性>`型（例: `shift_status`）
- マイグレーション: `NNNN_内容.sql`（例: `0001_foundation.sql`）

## 共通カラム（全テーブル必須）

```sql
id          uuid primary key default gen_random_uuid(),
company_id  uuid not null references companies(id),  -- companiesテーブル自身を除く
created_at  timestamptz not null default now(),
updated_at  timestamptz not null default now(),      -- trigger set_updated_at で自動更新
deleted_at  timestamptz                              -- 論理削除。物理削除は原則禁止
```

## RLS（確定パターン）

- 全テーブルRLS有効
- ヘルパー: `app.current_company_id()` — `staff.auth_user_id = auth.uid()`から解決（stable, security definer）
- 基本ポリシー: `company_id = app.current_company_id()` でテナント分離（select/insert/update）
- ロール別の細かい権限（例: 給与は本人or管理者のみ）は機微テーブルのみRLSで追加制御し、それ以外はアプリ層で制御 → DECISIONS #3
- 機微テーブル（`staff_wages`, `payroll_items`）: 本人 or 権限フラグ`can_manage_payroll`保持者のみselect可

## その他規約

- 金額: `integer`（円）。時間: `integer`（分）。浮動小数は使わない
- 日付のみ: `date`。時刻あり: `timestamptz`（JST変換はアプリ層）
- マスタ参照は削除時にnull化ではなく論理削除＋表示名スナップショット（給与明細等の確定データ）
- 監査: 書き込みServer Action共通ラッパーが`audit_logs`へ記録（actor, action, table, record_id, before, after）

## マイグレーション運用

- Supabase MCP `apply_migration`で適用し、同内容を`supabase/migrations/`にも保存（Gitが正）
- 破壊的変更は新カラム追加→移行→旧カラム削除の3段階
