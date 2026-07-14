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

## Git運用：コミットとpush（2026-07-14 自動push開通）

**push はAIが自動で実行する。ユーザーが毎回pushする運用は廃止。**

### 認証（設定済み・再設定不要）

| もの | 場所 | 中身 |
|---|---|---|
| GitHub PAT | `.git/gh_token.txt` | fine-grained・shift-cloudリポジトリのみ・Contents: Read and write |
| 認証ヘルパー | `.git/credhelper.sh` | tokenをcatして `x-access-token` として返すだけ |
| 登録 | `.git/config` の `credential.helper = !sh .git/credhelper.sh` | ローカル設定 |

`.git/` 配下＝**コミット対象外**。トークンがGitHubに上がることはない。ユーザーPC上に永続するのでセッションを跨いで有効。
トークン失効時（revoke/期限切れ）は、新しいPATを発行して `.git/gh_token.txt` を上書きするだけ。

### 鉄則：マウント上のgitで `add` / `commit` してはいけない

VM(bash)からマウント越しに既存ファイルを読むと**内容が途中で切れる**（例: `middleware.ts` が1465バイトで打ち切られる）。この状態で `git status` を取ると**存在しない「大量削除」の偽差分**が出る（2026-07-14: 33ファイル・1023行削除と表示 → ユーザーPCでは clean）。**気付かずコミットすればコードが本当に消える。**

- **読む**: Read/Write/Edit ツール（＝Windows実ファイル）が正。`cat`/`tail`/`grep` の結果は信用しない
- **commitツリーを作る**: `/tmp` にクローンし、実ファイル内容を書き戻してからコミット
- **push**: マウント上のgitでOK（ファイル内容を読まない操作なので安全）
- `--force` は使わない（過去にforce push事故あり）

### 手順

```bash
# 1. 実体確認（必須）。ユーザーPCの git status --short か Readツールで確認
# 2. クローンして作業ツリーを作る（毎回新しいdir名）
git clone --no-hardlinks "<mount>/YOZAN GENESIS" /tmp/wN
#    変更ファイルは Read で取得した“本物の内容”を /tmp/wN に書き戻す
# 3. /tmp/wN で commit
# 4. マウント側に取り込む
git -c fetch.unpackLimit=1 fetch /tmp/wN main
git update-ref refs/heads/main FETCH_HEAD
git reset
# 5. push（自動で通る）
git push origin main
```

`git reset` 後にマウント側で大量の `M` が残るのは**VM陳腐化ビューのアーティファクト**。ユーザーPCでは clean なので無視してよい。

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
