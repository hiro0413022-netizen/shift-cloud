# YOZAN Genesis — MASTER PROMPT

**これはYOZAN Genesis全モジュール共通の正規仕様。作業開始時にまずこれを読む。**

## ビジョン

YOZAN Genesis = AIが会社運営を支援・自動化する Company AI Operating System。
人間とAIエージェントが同じAPIを通じて会社を運営する基盤。

## 階層

```
YOZAN Genesis（会社AI OS：認証・テナント・権限・監査・通知・AI提案・承認フロー）
└── YOZAN Workforce OS（人・勤怠・シフト・給与ドメイン）
    └── YOZAN Shift Cloud（MVP：シフト・勤怠・給与・店舗運営をひとつに）
└── 将来: 予約OS / CRM OS / 在庫OS / 会計OS / レッスンOS ...（100+モジュール想定）
```

## 不変の設計前提

1. マルチテナント: company > brand > store の3階層。全データは`company_id`を持つ
2. 全書き込みは監査ログに残る
3. 全操作はAPI経由 — AIエージェントが人間と同等に操作できる
4. AI提案・承認フローの受け皿を全モジュールが持つ
5. SaaS外販前提のテナント分離
6. モジュールは疎結合。共通基盤はGenesis層のみに置く

## 技術スタック（確定）

Next.js (App Router) / TypeScript / Supabase (PostgreSQL + Auth + RLS) / Tailwind CSS / shadcn/ui / Vercel / GitHub / n8n / Sentry

## 参照ルール

- 共通規約: `/docs/genesis/*.md`
- Workforce OS固有: `/docs/modules/workforce-os/*.md`
- 決定事項: `/docs/genesis/DECISIONS.md`（同じ議論を繰り返さない）
- 次の作業: `/NEXT_TASKS.md`
- 変更履歴: `/CHANGELOG.md`
