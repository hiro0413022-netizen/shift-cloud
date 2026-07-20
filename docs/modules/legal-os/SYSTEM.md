# Legal OS — SYSTEM（契約書・証憑の保管と期限管理）

> 決定（本ドキュメントで確定）: **独立アプリ `apps/legal-os` として実装する（Member OS / Money OS と同じ勝ちパターン）。DBは共有し、APIとShared DBで管理する。**
> 理由: **YOZAN GENESIS は古川さんだけがログインする司令室**にしたい。書類アップロードのように古川さん以外（本部スタッフ・事業管理者）が触る面は、GENESISの外に独立アプリとして出す必要がある。GENESIS本体は登録された契約・期限を**閲覧・承認するだけ**（入力面を持たない）。
> 対応する上位方針: DECISIONS #15（独立アプリ方針）／#27（Member OS分離）を踏襲。VISION §4 法務AI（`legal_ai` 既存登録済）に実体（保管場所と期限管理）を与える。

## 0. なぜ作るか（背景）

「証憑・書類を貯める箱」が事業側に無い。今の資産の穴を埋める。

- Money OS は**金額データ**（売上・経費・カード明細）を持つが、`raw jsonb` に明細1行を残すだけで**証憑ファイル（PDF/画像）そのもの**は保管しない。
- VISION の法務AIは「契約書・規約・リスクチェック」を担当と定義されるが、**契約書の保管場所・期限管理の実体が無い**。
- 契約書は**更新期限・自動更新・解約通知期限**の管理が漏れると事故（自動更新で不要契約が延長、解約通知期限を過ぎて解約不可）になる。

本モジュールは経理系の証憑（請求書・領収書＝金額突合が主目的）とは分ける。それらは **Money OS 側の `mon_receipts`** が担当する（§9で相互リンク）。Legal OS が扱うのは**期限とリスクが主目的の書類**。

## 1. モジュール定義

| 項目 | 内容 |
|------|------|
| コード | `legal`（modulesテーブルのcodeと一致） |
| 名称 | 法務・契約管理（Legal OS） |
| ドメイン | legal |
| 対象事業 | YOZAN本部 / GOLF WING / FRANK GOLF(姫路) / KALLINOS / キャディ派遣（全社横断。事業紐付けは任意） |
| 主ユーザー | 古川さん・本部（登録・承認）／各事業管理者（自事業契約の閲覧） |
| 解決する課題 | 契約書・規約・覚書を一元保管し、更新/解約期限を自動アラート。法務AIがリスクと要点を抽出。締結は要承認で記録に残す |

## 2. アーキテクチャ

Member OS（DECISIONS #27）/ Money OS と同じ「独立アプリ＋DB共有＋API」構成。

- **独立Vercelプロジェクト `apps/legal-os`**（例: `legal-os.vercel.app`）。**古川さん以外がここにログインして書類をアップロード・管理する**。GENESIS本体には入力面を持たせない。
- **認証は同一Supabase Auth・actor**（Shift Cloud / GENESIS / Money OS と共通）。誰がどの操作をできるかは `leg_grants`（§3）で持つ。
- **DBは共有**（同じSupabase `qrgpblnnhdudigarrtuz`）。書いた瞬間にGENESIS側から見える。既存Kernel（audit_logs / approval_requests / notifications / company_events / decision_logs / ai_agents / development_statuses）を再利用。
- **APIで管理**: すべての操作を `/api/v1/*`（REST）でも叩けるようにする。これにより (a) legal_ai・CEO AI が同じ操作を呼べる、(b) 将来の電子契約サービス連携やバッチ取込がAPI経由でできる。UI（Server Actions）とAPIは同じドメインロジックを共有。
- **Supabase Storage 新規プライベートバケット `legal-docs`**（現状バケット未使用＝本アプリが初導入）。ファイル実体はStorage、メタ情報は `leg_*` テーブル。ダウンロードは短命の署名付きURL（signed URL）経由。`company_id` でパス分離（`legal-docs/{company_id}/{document_id}/{filename}`）。
- **セグメントは `fin_segments` を流用**（Money OS/Finance と同じ）。ただし全社契約が多いため `segment_id` は **任意（null=全社）**。
- **GENESIS本体の役割**: 契約期限アラート・高リスク契約・承認待ちを**閲覧＋承認**するだけ（実データの源泉はこの独立アプリ）。Money OSでのFinance画面の位置づけ変更と同じ考え方。

```
apps/legal-os（古川さん以外もログイン）
  UI(アップロード/編集)  ─┐
  API /api/v1/*         ─┴─▶ 共有DB(leg_* テーブル) + Storage(legal-docs)
                                    │
                             legal_ai がOCR→要点/リスク/期限を提案（人が確定）
                                    │
                期限接近 → notifications ＋ GENESISのCEO AI「判断リスト」
                締結/更新/解約 → approval_requests（古川さん承認）＋ decision_logs
                                    ▼
                    GENESIS（古川さん専用）: 閲覧・承認のみ
```

## 3. 権限設計（独立アプリ × 全社横断）

Money OS `mon_grants` と同じく **ユーザー × 役割** で持つ。新テーブル `leg_grants(user_id, role, segment_id)`。認証はGENESIS/Money OSと同一（同じSupabase Auth・actor）。

- `uploader` — 本部スタッフ等。契約・書類の**アップロードと下書き登録**（`draft`）。
- `manager` — 本部法務担当。編集・期限設定・削除申請・全社契約の管理。
- `viewer` — 各事業管理者。自事業（`segment_id` 一致）＋全社(null)契約の閲覧のみ。
- 締結・更新・解約の**最終承認は古川さん**（アプリ上の役割ではなく GENESIS 側 approval_requests で実行）。
- 機微情報を含むため既定は限定公開。RLSは `company_id` テナント分離＋ `leg_grants` の役割・segmentでの行フィルタ。

## 4. データモデル

全テーブル共通: `id / company_id / created_at / updated_at / deleted_at`、RLSテナント分離（DATABASE_STANDARD準拠）。

### 4-1. `leg_documents`（契約・書類 本体）

| 列 | 内容 |
|----|------|
| id / company_id | 標準 |
| segment_id | `fin_segments` 参照。**null=全社契約** |
| doc_type | `contract`（契約書）/ `agreement`（覚書・MOU）/ `terms`（規約）/ `nda` / `other` |
| title | 件名（例: 「テナント賃貸借契約（宝塚店）」） |
| counterparty | 相手方名（テキスト。マスタ化は後回し） |
| status | `draft` / `under_review`（法務AIレビュー中）/ `pending_approval`（承認待ち）/ `active`（有効）/ `expired` / `terminated` / `archived` |
| effective_date | 契約開始日 |
| expiry_date | 契約満了日 |
| auto_renew | 自動更新の有無（bool） |
| renewal_notice_days | 解約通知の必要日数（例: 満了3ヶ月前＝90）。**アラート起点** |
| next_action_date | 導出列 or 保持: 「解約判断すべき期日」= expiry_date − renewal_notice_days |
| amount / currency | 契約金額（任意。月額/総額はメモ or detail） |
| risk_level | `low` / `medium` / `high`（legal_ai提案→人確定） |
| summary | 要点（legal_ai抽出→人編集可） |
| detail jsonb | 種別ごとの追加項目（更新条件文・特約・管轄など） |
| created_by / approved_by | actor |

### 4-2. `leg_files`（証憑ファイル）

1契約に複数版・付属書類を持てる。

| 列 | 内容 |
|----|------|
| id / company_id | 標準 |
| document_id | `leg_documents` 参照 |
| storage_path | `legal-docs/{company}/{document}/{filename}` |
| file_name / mime_type / size_bytes | メタ |
| kind | `original`（原本PDF）/ `signed`（締結済）/ `amendment`（変更覚書）/ `attachment` |
| ocr_text | 抽出テキスト（legal_aiの入力。全文検索用 tsvector を後付け可） |
| uploaded_by | actor |

### 4-3. `leg_reminders`（期限アラート）— 任意（導出でも可）

`next_action_date` から夜間ジョブで生成してもよいが、複数期日（更新期限・保証期限・支払期限）を持たせたいので専用テーブルにする。

| 列 | 内容 |
|----|------|
| id / company_id / document_id | 標準＋参照 |
| kind | `renewal`（更新）/ `termination_notice`（解約通知期限）/ `expiry`（満了）/ `custom` |
| due_date | 期日 |
| lead_days | 何日前に通知するか（例: 30） |
| status | `scheduled` / `notified` / `done` / `dismissed` |
| note | 補足 |

> 相手方の名寄せが必要になったら `leg_parties`（取引先マスタ）を後で足す。フェーズ1はテキスト `counterparty` で十分。

## 5. 画面

### 5-1. 独立アプリ `apps/legal-os`（古川さん以外もログイン）

- **ダッシュボード**: 90日以内に期限が来る契約 / 自動更新が近い契約 / high リスク契約 / 自分の下書き。
- **契約一覧**: 種別・事業・ステータス・相手方・期限でフィルタ。期限が近い順デフォルト。`leg_grants` で見える範囲を出し分け。
- **契約詳細**: メタ＋ファイル版履歴＋legal_ai要点/リスク＋期限タイムライン。原本は署名付きURLで表示。
- **登録/編集（uploader/manager）**: ファイルをアップロード → legal_ai が種別・相手方・期間・更新条件・リスクを**提案** → 人が確認・修正して保存（AIは提案まで、確定は人）。

### 5-2. GENESIS本体（古川さん専用・閲覧＋承認のみ）

- Cockpitトップに「契約期限アラート」を1枠（90日以内の更新/解約期限、高リスク契約）。
- 承認待ち（締結・更新・解約・ファイル削除）を approval_requests から表示し、その場で承認/差し戻し。
- 入力面は持たない。

## 6. legal_ai の動き（VISION §4 準拠）

既存 `legal_ai`（watch: 契約書/規約/法令変更、judge: 法的リスクの有無、execute: リスクチェックレポート、**契約締結は要承認**）をそのまま接続。

1. ファイルアップロード → OCR で `ocr_text` 生成
2. 本文から **相手方 / 契約期間 / 自動更新条件 / 解約通知期限 / 主要リスク** を抽出し `leg_documents` の各列と `summary` に**提案**（`status=under_review`）
3. 人が確認・確定 → `active`
4. 期限接近を検知 → `notifications` ＋ CEO AI の「今日の判断リスト」に上げる
5. リスクチェックレポートを `ai_execution_logs` に記録。締結・更新の実行は `approval_requests`

## 7. Kernel接続（Genesisモジュールの条件・MODULE_TEMPLATE §3）

- [ ] 重要操作を **company_events** に記録（`legal.document_registered` / `legal.contract_signed` / `legal.renewal_due` / `legal.terminated`）
- [ ] 学び・勝ちパターンを **business_memories** に残す導線
- [ ] 締結・更新・解約の判断を **decision_logs** に記録
- [ ] 締結・更新・解約・ファイル削除は **approval_requests** に回す（要承認）
- [ ] 全ミューテーションを **audit_logs** に記録
- [ ] 担当AI **`legal_ai`**（登録済）を接続 → **ai_execution_logs**。日次で期限接近・高リスク契約を分析
- [ ] **development_statuses** にレコード作成（CEO AIが進捗把握）
- [ ] 期限通知は既存 **notifications** を再利用
- [ ] 外部連携（電子契約: クラウドサイン/DocuSign等）は将来 **connectors** 経由
- [ ] **独自URL（`legal-os.vercel.app`）とログインを持つため、稼働時に `vault_systems` へ必ず登録**（Vaultルール準拠。パスワードはユーザーがページ入力、AIは記載しない）

## 8. Money OS / 経理系との境界（重要）

**分ける。** 目的が違う。

| | Legal OS（本モジュール） | Money OS `mon_receipts`（別途） |
|---|---|---|
| 対象 | 契約書・覚書・規約・NDA | 請求書・見積・領収書・レシート |
| 主目的 | 期限管理・法的リスク | 金額突合・電子帳簿保存法対応 |
| 紐付け | 事業は任意（全社契約多い） | `mon_expense` / `mon_bank_txn` に1:1 |
| 担当AI | legal_ai | 経理AI（accounting_ai） |

### 相互リンク（1本だけ）

顧問料・リース・保守など「契約に基づいて毎月請求が来る」ケースは、`mon_receipts`（または請求明細）に `leg_document_id` を1本張り、契約↔請求を辿れるようにする。それ以上の統合はしない（二重管理回避）。両アプリはDBを共有しているので、外部連携なしにIDリンクだけで済む。

## 9. フェーズ計画

- **フェーズ1（最小・独立アプリで保管と期限）**: `apps/legal-os`（独立Vercel）＋ `leg_documents` ＋ `leg_files` ＋ `leg_reminders` ＋ `leg_grants` ＋ Storageバケット `legal-docs` ＋ 画面（一覧・詳細・登録・ダッシュボード）＋ `/api/v1/*`。古川さん以外がログインしてアップロード、期限アラートを出す最小形。GENESISは閲覧・承認のみ。
- **フェーズ2（legal_ai）**: OCR＋要点/リスク/期限の自動抽出提案、日次の期限・高リスク分析、CEO AI連携。
- **フェーズ3（連携）**: Money OS `mon_receipts` との相互リンク（`leg_document_id`）、電子契約サービス連携（connectors）、全文検索、相手方マスタ `leg_parties`。

## 10. 実装手順（標準フロー）

1. modulesテーブルに `legal` を追加（status: designing）
2. 本設計書を確定 → CEO AI Command Center でプロンプト生成
3. migration追加（`leg_*` 新規テーブル＋`leg_grants`＋Storageバケット `legal-docs`＋RLSポリシー。既存テーブル変更なし）
4. 独立アプリ `apps/legal-os`（別Vercelプロジェクト）を実装（UI＋Server Actions＋`/api/v1/*`）。Member OS / Money OS の分離パターンを踏襲（DECISIONS #15/#27）
5. GENESIS側に閲覧＋承認の1画面を追加（入力面なし）
6. `vault_systems` へ登録（独自URL・ログインを持つため。Vaultルール準拠）
7. development_statuses 更新 → status: live
8. CHANGELOG.md・DECISIONS.md 更新（Legal OS を①経理系と分けた ②独立アプリにした の2決定を記録）

## 11. 境界

- 契約・書類の**保管・期限管理・リスク提示**まで。契約書の作成代行・法的助言・実際の締結交渉は対象外（legal_ai はレビュー提案、締結は人が承認・実行）。
- 請求書・領収書の金額突合と電帳法保存は **Money OS `mon_receipts`** の担当（本モジュールではない）。

## 9. フェーズ2実装記録（2026-07-11 / DECISIONS #40）

- **日次チェック**: `apps/genesis/src/lib/legal-checks.ts`（ルールベース・Claude API不要）。解約判断期日（next_action_date）90日以内・契約満了60日以内・risk_level=high・under_review14日滞留 を判断リストへ。文書1件につき最重要1項目のみ起票
- **自動抽出**: `apps/genesis/src/lib/legal-ai.ts`。日次cron（runDailyCeoReport）から1件/日。対象=未抽出（detail.ai_extractedなし）かつ主要項目欠落のdraft/under_review。leg_filesのPDF/画像（4MB以下）をClaude APIで読解→抽出。**人の入力は上書きせずnull項目のみ提案で埋める**。提案全文はdetail.ai_extractedに保存（やり直し可能）。ocr_textには要点ダイジェストを保存（全文転写はコスト過大のため非実施）。抽出後next_action_date自動計算＋scheduledリマインダーが無ければ自動生成。ai_execution_logs/company_eventsに記録
- 環境変数: `ANTHROPIC_API_KEY`（genesis。未設定なら抽出はスキップ）、`LEGAL_AI_MODEL`（既定claude-haiku-4-5）
