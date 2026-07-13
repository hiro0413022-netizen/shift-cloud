# DEVELOPMENT RULES（クレジット節約ルール）

## 12原則

1. 共通ルールは `/docs/genesis` を参照する（再生成しない）
2. Workforce OS固有情報は `/docs/modules/workforce-os` を参照する
3. 毎回すべてを説明し直さない
4. 変更時は差分だけを出す
5. 長文説明より、ファイル単位の変更に集中する
6. 実装前に対象ファイルを限定する
7. 1回の作業は1画面または1機能に絞る
8. 既存コードを全探索しない。必要なファイルだけ読む
9. 同じ設計判断を繰り返さない
10. 決定事項は `DECISIONS.md` に保存する
11. 実装後は `CHANGELOG.md` に差分だけ残す
12. 次回作業用に `NEXT_TASKS.md` を更新する

## 作業フロー

```
NEXT_TASKS.md確認 → 対象ファイル宣言 → 実装 → 動作確認 → CHANGELOG追記 → NEXT_TASKS更新
```

## コード規約（要点）

- TypeScript strict。`any`禁止
- DB型は `supabase gen types` で生成、手書きしない
- 機能単位のコロケーション: `src/features/<feature>/{actions,components,queries}.ts(x)`
- UIはshadcn/uiベース。独自コンポーネントは`packages/ui`
- コミット: `feat|fix|docs|chore(scope): 内容`（日本語可）

## 給与・労働時間の計算（DECISIONS #53）

**数字の正典は1本だけ。画面ごとに集計を書かない。**

| やること | 使うもの |
|---|---|
| 金額（時給・月給・交通費・手当・残業） | `apps/shift-cloud/src/lib/payroll-calc.ts` の `calcMonthlyPayroll()` |
| 労働時間・店舗別集計 | `apps/shift-cloud/src/lib/labor-summary.ts` の `summarizeLabor()` |
| 月の範囲（from/to・月末日） | `payroll-calc.ts` の `monthRange()` |

**禁止**（CIの `npm run check:labor` が機械的に落とす）

- `work_minutes` を画面側で `reduce` / `+=` して合計する → **15分丸め（companies.settings.rounding_minutes）が抜ける**
- `hourly_wage` / `monthly_salary` を画面側で直接掛ける → **月給者が0円になる・交通費と手当が抜ける**
- 月末日を `` `${ym}-31` `` で決め打ちする → **2月等で対象0件になる**

**注意点**

- `attendance_days.work_minutes` は **休憩控除後**（`recalcAttendance` = 拘束 − 休憩）。ここからさらに休憩を引かない
- 月給者は **勤怠0日でも満額支給**。`includeStaffIds` に入れ忘れると人件費から丸ごと消える（#44）
- SQL側（`refresh_shift_cloud_kpis` / migration 0046）はTSと同じ式を持つ二重実装。**式を変えたら両方直す**。`tests/labor-summary.test.ts` が実データで固定している
