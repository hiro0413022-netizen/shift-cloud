# モジュール化 優先順位表（2026-08-07）

目的: 次のシステムを1/3の工数で作る。売るのはモジュールではなく、モジュールで組んだ完成品（SWING CORTEX / Sales OS / demo-sales / インドアゴルフ店パッケージ）。

前提: `packages/README.md` の既存方針（新規アプリは `@yozan/core`、既存アプリの移行は1アプリずつ・Vercelビルド確認付き=B-6）を維持。一括リファクタリングはしない。

## 判定基準

「2回以上コピーされている」「次の商品で確実に使う」の両方を満たすものだけ切り出す。1箇所でしか使っていないものは、2回目に使うときに切り出す。

## 優先順位表（重複はリポジトリ実測 2026-08-07）

| 順位 | モジュール案 | 実測の根拠 | 効果 | 工数目安 | 切り出しタイミング |
|---|---|---|---|---|---|
| 1 | `@yozan/import`（CSV/Excel取込） | **10アプリで重複**（caddy-os, genesis, golfwing, lesson-os, member-os, money-golfwing, reserve-os, shift-cloud, survey-os, swing-cortex） | 最大。取込は新事業でも必ず要る。パーサ＋プレビュー＋確定投入の共通枠だけ切り出し、列マッピングは各アプリ側に残す | 中 | 次に取込機能を触る案件で |
| 2 | `@yozan/billing`（Stripe課金） | genesis / swing-cortex / sites/frank-golf / packages/content の4箇所 | GOLF WING2号店・FRANK本番・SaaS課金の全部で使う。Webhook検証＋顧客/サブスク管理を共通化。**sk_live差替え（FRANK）前に整理すると一石二鳥** | 中 | FRANK本番課金の準備時 |
| 3 | `@yozan/jst`（JST日付） | genesis と inventory-os に**同名libのコピーが既に発生**。JSTルール（#73）はcore同梱が本来の姿 | 小さいが再発防止価値が高い。日付ズレは実障害の前歴あり | 小 | すぐ（@yozan/coreに追加するだけ） |
| 4 | `@yozan/cron`（cron実行基盤） | genesis / demo-sales の2箇所。CRON_SECRET検証・middleware 307回避・再開処理は両方でハマった前歴（報告パイプライン停止・prospect） | 3つ目のcronアプリが出た時点でコピーが増殖する前に | 小〜中 | 次にcronを持つアプリを作るとき |
| 5 | `@yozan/approval`（承認フロー） | genesis集中（判断フィード・承認カード・gn_feedback学習）。重複はまだ無い | 「AIが提案→人が承認→実行」はYOZANの中核UXで、外販SaaSの差別化要素になる。ただしgenesisのDB（gn_*）に密結合なので切り出しコストが最大 | 大 | 外販商品に承認UXを載せる案件が確定したら。先行着手しない |
| — | LINE配信 | genesisのみに集中（実測で他アプリに重複なし） | **既に事実上モジュール化済み**。切り出し不要、genesis経由で使い続ける | — | — |

## 切り出さないもの

- 事業固有ロジック: キャディ原価（社員原価0のCHECK制約）、GOLF WING料金表・月会費予測、給与計算式。汎用化してもリターンがない
- UI/デザイン: README記載どおり既存アプリの分岐が大きく、集約は回帰リスク > 効果
- 1箇所でしか使っていない機能すべて（先回りの汎用化は保守負債）

## 販売視点での組み合わせ（参考）

- インドアゴルフ店パッケージ = member-os + 予約(frunk_bookings型) + `@yozan/billing` + Shift Cloud → 2号店・FRANKで自社検証済みが営業材料
- 営業支援パッケージ = prospect + outreach + track + demo-sales（既にpackages化済みの成功例）

## 運用ルール

新機能を作るとき「これは2回目か？」を判定し、2回目なら `packages/` へ。切り出したら `packages/README.md` に追記し、DECISIONSに記録。並行セッションのDECISIONS衝突に注意。
