# Money OS — SYSTEM（お金管理・独立アプリ群）

> 決定（本ドキュメントで確定）: **GENESIS内モジュールではなく、Shift Cloud / Member OSと同じ独立アプリとして切り出す。**
> 事業ごとに別アプリ（まずGOLF WING）／薄い共通コアを全事業で再利用／DBは共有しGENESISのKPIへ自動流入。
> 対応するユーザー選択: フェーズ1=「全事業の共通コアを薄く」、位置づけ=「事業ごとに分ける」。

## 0. なぜ作るか（背景）

GOLF WINGは既にExcelで「小さな経理」を丸ごと運用している。単なる売上入力ではない。

- **売上一覧**（28〜31期・各1,700行前後）: 日付/お客様/会員・ビジター/品目(利用料・月会費・販売)/種類/メーカー/品名/定価/割引/売価/個数/金額/税込/支払方法/担当プロ/入力者
- **現金出納帳**: 入金・出金・現金残高・チェック・差異
- **金種管理**: レジ・金庫を1万円札〜硬貨まで枚数カウント（時点棚卸）
- **仕入れ一覧 / 経費管理(現金・商品) / 注残リスト**

課題は「別々のExcel・期ごとにシート分割・現金売上が売上表と出納帳に二重入力・金種差異は手チェック・商品別内訳は手集計」。
さらにGOLF WINGスタッフが入力するが、YOZANグループ／KALLINOS／キャディ派遣／SNS・Web／姫路インドアは**別々の人が管理**する。事業単位で入力者・管理者を分けられる仕組みが要る。

## 1. モジュール定義

| 項目 | 内容 |
|------|------|
| コード | `money`（共通コア）／アプリは事業別（`money-golfwing` 等） |
| 名称 | お金管理（現場経理）。第1弾: **GOLF WING お金管理** |
| ドメイン | operation / finance |
| 対象事業 | GOLF WING(宝塚) / 姫路インドア / KALLINOS / キャディ派遣 / SNS・Web / YOZAN本部 |
| 主ユーザー | 各事業の現場スタッフ（入力）・事業管理者（締め）・本部経理/CEO（横断） |
| 解決する課題 | 現場のお金（売上・現金・経費）をExcelから移行し、二重入力/手集計を排除。入力した瞬間にGENESISのPL・KPI・経理AIへ自動集約する |

## 2. アーキテクチャ

Member OS分離（DECISIONS #27）と同じ勝ちパターン。

- **独立Vercelプロジェクト**（事業ごと）。GOLF WINGスタッフはこのアプリだけ見ればよい。第1弾 `apps/money-golfwing`（Vercel: `money-golfwing`）。
- **薄い共通コア** `packages/money-core`: スキーマ・Server Actions・UI（売上・現金出納・経費・金種）を全事業で再利用。事業別アプリは「どの事業(segment)を扱うか」を環境変数で固定し、コアを組むだけ。
- **DBは共有**（同じSupabase `qrgpblnnhdudigarrtuz`）。書いた瞬間に集計→`fin_entries`→`refresh_finance_kpis`でGENESISのKPIが埋まる。二重管理ゼロ。
- **GENESIS側Financeの役割変更**: 手入力の受け皿 → 「グループ全体PL閲覧＋経理AI分析」画面へ。実データの源泉はこの新アプリ。

```
現場アプリ(事業別)  ──書込──▶  共有DB(money_* テーブル)
   売上明細/現金出納/経費/金種            │
                                    夜間 or 保存時に集計
                                          ▼
                          fin_entries（事業×科目×月）
                                          ▼
                          refresh_finance_kpis → kpis
                                          ▼
                     GENESIS: トップKPI / Finance / 経理AI・CEO AI
```

## 3. 権限設計（複数事業 × 複数管理者）

核心。**ユーザー × 事業(segment) × 役割** で持つ。

- 役割: `input`（自事業のみ書込）/ `manager`（自事業の締め・修正・帳票・削除申請）/ `viewer`（自事業の閲覧）
- 横断: 既存 `view_hq` に加え `manage_money_all`（本部経理・CEO）＝全事業を横断で閲覧・締め
- 例: GOLF WINGスタッフ=宝塚の`input`のみ / 姫路担当=姫路の`input` / 古川さん・本部経理=`manage_money_all`

新テーブル `mon_grants(user_id, segment_id, role)`。認証はShift Cloud/GENESISと同一（同じSupabase Auth・actor）。

## 4. データモデル

全テーブル共通: `id / company_id / created_at / updated_at / deleted_at`、RLSテナント分離、`segment_id`で事業分離。

### 4-1. 共通コア（フェーズ1・全事業）

- **`mon_sales`（売上）** — 日付 / segment_id / 区分(category: 利用料・月会費・販売・その他) / 顧客名(任意) / 会員区分(任意) / 金額 / 税込 / 支払方法(現金・Airペイ・SBペイ・振込…) / メモ / 入力者 / `detail jsonb`（事業別の追加項目）
- **`mon_cash_ledger`（現金出納）** — 日付 / segment_id / 摘要区分 / 内容 / 相手・顧客 / 入金 / 出金 / 現金残高 / 差異 / 入力者 / source（`sales`から自動 or `manual`）
- **`mon_expense`（経費）** — 日付 / segment_id / 項目 / 支払先 / 金額 / 方法 / 区分 / メモ / 精算者
- **`mon_cash_count`（金種棚卸）** — 棚卸日時 / segment_id / 場所(register/safe) / 金種内訳 `jsonb {10000:n,…}` / 合計 / 理論残高 / 差異 / 実施者

### 4-2. GOLF WING拡張（フェーズ2）

- **`mon_sales` 拡張列/detail**: 品目 / 種類 / メーカー / 品名 / 定価 / 割引額 / 個数 / 担当プロ / 販売者（Excel売上一覧の全列を1:1でカバー）
- **`mon_purchase`（仕入）** — 発注日 / メーカー / 品名 / 発注先 / 個数 / 顧客名 / 掛け率 / 単価 / 到着日 / 検品者
- **`mon_backorder`（注残）** — 仕入とリンク、顧客取り寄せ追跡

### 4-3. カード・口座のCSV取込（会社経費・支払）

現場の現金とは別に、**会社全体の経費・支払**はカード/口座から取り込む。AMEX（利用明細）と尼崎信用金庫（入出金明細）をCSVで取込。

- **`mon_bank_source`（取込元マスタ）** — code(`amex` / `amashin`) / name / type(`card` / `bank`) / mapping `jsonb`（CSVの列名 → 項目の対応表。日付列・金額列・摘要列・入出金の符号ルール等） / 既定の事業配賦・科目
- **`mon_bank_txn`（カード・口座明細）** — source_id / 取引日 / 摘要・利用先 / 金額（出金= –、入金= +） / 残高（口座のみ） / segment_id（配賦先。未配賦=null） / category（`fin_categories.code`） / status(`unassigned`未仕分け / `confirmed`確定) / memo / `raw jsonb`（原文1行を保持） / **`dedup_key`**（source＋取引日＋金額＋摘要ハッシュ。重複取込を防止）

**取込フロー**: CSVアップロード → 取込元プロファイルで正規化 → `mon_bank_txn` に`unassigned`で投入（`dedup_key`で重複スキップ）→ 事業・科目を割当（**経理AIが過去の割当から推測して提案**、人が確定）→ `confirmed` にした行が経費として集計対象に入る。

CSV形式は取込元ごとに違う（AMEXと信金で列も符号も別）ため、**列マッピングは各社の実CSVサンプルで確定**する。新しい取込元は`mon_bank_source`に1行追加すれば増やせる。

### 4-4. 集約（既存資産の再利用）

夜間 or 保存時に **`mon_sales`（売上）＋`mon_expense`（現場経費）＋`mon_bank_txn`のconfirmed（カード・口座経費）** を **事業×科目×月** へ集計し既存 `fin_entries` にupsert → `refresh_finance_kpis`。GENESIS側は無改修でKPIが埋まる。科目マッピング表 `mon_category_map(区分 → fin_categories.code)` を持つ。未配賦(segment_id=null)の明細は「本部・共通(hq)」へ寄せるか、按分ルールを後で定義。

## 5. 画面（共通コア）

事業別アプリで共通。ログインユーザーの`mon_grants`で見える事業・操作を出し分け。

- **ダッシュボード**: 今月の売上/経費/粗利、現金残高、直近の差異アラート、未締め件数
- **売上入力/一覧**: 明細フォーム＋一覧（期・月・支払方法フィルタ）。GOLF WINGは品目/メーカー等の拡張フォーム
- **現金出納**: 入金/出金入力、残高自動計算、売上(現金)の自動流入行を表示
- **金種棚卸**: レジ・金庫の枚数入力→合計自動、理論残高との差異自動表示
- **経費入力/一覧**
- **カード・口座取込**（本部経理）: CSVアップロード→取込結果（成功/重複/エラー）→ 未仕分け明細に事業・科目を割当（経理AI提案付き）→ 確定
- **月次締め**（managerのみ）: その月をロック→`fin_entries`確定

## 6. 現場フローとExcel比の改善

1. **現金売上の二重入力を解消**: 支払方法=現金の`mon_sales`を`mon_cash_ledger`へ自動反映
2. **金種差異を自動計算**: 出納帳の理論残高 vs 金種カウント合計を突合、差異列を自動表示
3. **期の壁を撤廃**: 期は日付から導出（属性保持）。シート分割を廃止、期切替はフィルタ
4. **商品別月次内訳を自動集計**（シャフト/クラブ/グリップ/ボール/グローブ/その他）
5. **仕入⇄売上⇄注残を連動**（顧客取り寄せの追跡）

## 7. GENESIS / Kernel接続（Genesisアプリの条件）

- [ ] 重要操作を **company_events** に記録（`money.sale_created` / `money.month_closed` / `money.cash_diff_detected` 等）
- [ ] 学び・勝ちパターンを **business_memories** に残す導線
- [ ] 締め・差異是正など重要判断を **decision_logs** に記録
- [ ] 削除・月次締めの取消は **approval_requests** に回す
- [ ] 全ミューテーションを **audit_logs** に記録
- [ ] 担当AIを **ai_agents** に接続（`accounting_ai`＝経理AI。既存登録済）→ `ai_execution_logs`。経理AIが日次で差異・粗利異常・支払方法別内訳を分析
- [ ] **development_statuses** にレコード作成（CEO AIが進捗把握）
- [ ] 外部連携（会計ソフト/POS）は将来 **connectors** 経由（DECISIONS #21の後続方針を踏襲）
- [ ] 稼働時に **vault_systems** へ登録（独自URL・ログインを持つため。Vaultルール準拠）

## 8. Excel移行（既存4期分）

- `mon_sales`: 28〜31期売上一覧を列マッピングで取込（品目/種類/メーカー/支払方法の表記ゆれ正規化）。Member OS Phase Dの移行手順（SQL生成→SQL Editorで本番実行）を踏襲
- `mon_cash_ledger` / `mon_cash_count`: 31期現金出納帳・金種管理から取込
- `mon_purchase` / `mon_expense`: 納品書.xlsx の仕入れ一覧・経費管理から取込
- PIIを含む生Excelはリポジトリ非格納

## 9. フェーズ計画

- **フェーズ1（薄い共通コア）**: `mon_sales`(基本列)・`mon_cash_ledger`・`mon_expense`・`mon_cash_count` ＋ `mon_grants` ＋ **カード・口座CSV取込**（`mon_bank_source`/`mon_bank_txn`、AMEX・尼崎信金）＋ 集約→`fin_entries`。`apps/money-golfwing` を最初の実体として出す。全事業で使える最小形。
- **フェーズ2（GOLF WING細部）**: 売上明細の拡張列・`mon_purchase`・`mon_backorder`・商品別内訳・仕入連動。Excelを完全置換。
- **フェーズ3（横展開）**: KALLINOS / キャディ派遣 / 姫路 / SNS・Web を各事業アプリとして複製（コア再利用）。事業ごとに必要な帳票だけ追加。
- **後続**: 会計ソフトAPI連携・資金繰り予測・予実管理（DECISIONS #21）。

## 10. 実装手順（標準フロー）

1. modulesに `money` を追加（status: designing）
2. 本設計書を確定 → CEO AI Command Centerでプロンプト生成
3. migration追加（`mon_*` 新規テーブル。既存 `fin_entries` は変更なし＝upsert利用）
4. `packages/money-core` ＋ `apps/money-golfwing` 実装（DECISIONS #15: 独立アプリ方針）
5. Excel移行SQL生成→本番投入→KPI自動接続を検証
6. development_statuses更新 → status: live
7. CHANGELOG.md・DECISIONS.md・vault_systems更新

## 11. 境界

- 現場の売上・現金・経費・仕入の**記録と集計・月次締め**まで。税務申告・仕訳の正規化・振込実行は対象外（税理士連携／会計ソフトは後続）
- GENESISのFinanceは「グループPL閲覧＋AI分析」。本アプリが実データの源泉

## 8. mon_receipts — 経理証憑（フェーズ1実装 2026-07-11 / DECISIONS #29a・#41）

**目的**: 請求書・見積書・領収書・レシート・納品書の電子保管（電子帳簿保存法）＋経費/明細との金額突合の土台。契約書はLegal OS（leg_*）が担当し、顧問料等は `leg_document_id` 1本で契約↔請求をリンク（#29a、二重管理回避）。

- **テーブル**: `mon_receipts`（0034適用済）— kind(invoice/quote/receipt/delivery/other)・issue_date・counterparty・amount・status(unmatched/matched/archived)・mon_expense_id/mon_bank_txn_id/leg_document_id・storage_path・ocr_text(経理AI用の器)
- **Storage**: プライベートバケット `mon-receipts`（company_id先頭パスのobject RLS、legal-docsと同方式）
- **画面**: `/receipts` — 撮影画像/PDFのアップロード（8MBまで）→月・種別フィルタ一覧→行を開いてメタ編集・突合状態変更・署名付きURL閲覧。**「まず撮って登録→後で整える」**運用。削除は論理削除のみ（Storage実体は保持＝保存要件配慮）
- **後続（経理AIフェーズ）**: OCRで金額/日付/店名を自動抽出→mon_expense自動起票→mon_bank_txnとの自動突合提案
