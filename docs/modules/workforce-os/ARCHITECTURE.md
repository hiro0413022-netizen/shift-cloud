# Workforce OS — ARCHITECTURE

全体は `/docs/genesis/ARCHITECTURE.md`。ここはshift-cloud固有。

## ディレクトリ（apps/shift-cloud）

```
src/
  app/
    (auth)/login, reset-password
    (staff)/home, shifts, requests, notices     … モバイルレイアウト
    (admin)/...                                  … サイドバーレイアウト
    (hq)/dashboard, suggestions
    kiosk/[token]/
    api/v1/                                      … Phase 6
  features/
    staff/ org/ templates/ schedule-types/
    shift-requests/ shifts/ attendance/ kiosk/
    payroll/ announcements/ notifications/
    suggestions/ audit/
      各: actions.ts / queries.ts / schema.ts / components/
  lib/ (supabase client, execute wrapper, auth helpers)
```

## 集計の実装方針

- `attendance_days`は打刻イベント発生時にサーバーで再計算（`recalculateAttendanceDay`）。バッチに依存しない
- 月末照合・給与集計はSQL集計（Postgres関数 or サーバー側クエリ）。結果は`payroll_items`に確定保存
- 本部ダッシュボードはまずリアルタイム集計クエリ、遅くなったらマテビュー化

## 通知

- MVP: アプリ内通知（`notifications`テーブル＋ベルアイコン）
- Phase 6: n8n経由でLINE/Slack配信（`integration_configs`）
