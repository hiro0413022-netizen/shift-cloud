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
