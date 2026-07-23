# SWING CORTEX — コーチング診断SaaS（GOLF WING Finder 後継 / 外販ブランド）

作成: 2026-07-22。GOLF WING Finder（Genspark製プロトタイプ）を土台に、**Genesis連携・SaaS外販・UI全面刷新**を前提に再設計した正典。
本書は設計書。動くUIプロトタイプは同フォルダ `prototype.html`。

---

## 0. 結論（先に要点）

1. 売り物はUIではなく **「実レッスンから育った診断脳」**。他社はUIを1週間で真似できるが、**5,939件の実コメントと、それを構造化・自己増殖させるAIパイプライン**は真似できない。ここを堀の中心に据える。
2. ブランドは自社運用名（GOLF WING）と分離し、外販SaaSブランド **SWING CORTEX（スイングコルテックス）** を新設。位置づけは「現場のレッスン1件ごとに賢くなる、コーチングの共有脳」。
3. Genesis群の資産（company_id分離・RLS・独立アプリ型・lesson-os・member-os・KPI・Claude API）に**相乗り**する。ゼロから作らない。
4. 課金・オンボーディングは SAAS_PLAN.md の3段構え（ウィザード / AI設定コンシェルジュ / 導入代行）をそのまま流用し、**乗り換えコストで囲い込む**。

> ブランド名の代替案: GreenBook（キャディの蓄積ノートの比喩）/ Caddie Brain / TeachMate。本書とプロトタイプは SWING CORTEX で統一。名称は最終決定で一括置換可能。

---

## 1. 現行 GOLF WING Finder の評価（何を継ぎ、何を捨てるか）

**継ぐもの（コンセプトは正しい）**
- 症状 → 確認優先度つきチェック項目 → 〈原因〉〈改善・対処法〉〈お客様への説明〉の3点セット
- 「お客様向けにコピー / LINEで送る / 指導メモをコピー」という**接客導線**
- Excel取込による非エンジニア運用、コーチ別の履歴・お気に入り

**捨てる／作り替えるもの**
- **データがブラウザ内（Excel/JSON手動）で完結し、蓄積されない** → Genesis共有DB（Supabase）へ。全社・全店・全コーチの入力が1つの脳に集まる構造に。
- **診断が「症状を選ぶ」静的な逆引き辞書** → 生徒の症状文/動画から**候補を出す動的診断**へ。
- **UIが情報過多で階層が深い**（左リスト＋4タブ＋No.1-6＋3ブロック×コピー）→ 後述の「3タップ診断」へ再設計。
- **単一施設のデモ認証（施設ID＋PW、デモ平文表示）** → Genesisのマルチテナント認証・RLSへ。

---

## 2. プロダクトの核（ユースケース）

> **ポジション修正（2026-07-22・ユーザー確認）**: これは「5,000件を検索する」ツールでも「診断辞書」でもない。**レッスン中のコーチをその場で助ける**ツールが主フロー。コーチは症状名を知らなくてよく、**見たまま（「右に曲がる」「回らない」）を短文・音声で入れると最適な原因/対処/生徒向け説明が出る**。5,939件の実コメントは**人が見る対象ではなくAIの燃料**（照合・言い回し・将来のパーソナライズ）で、UIには一切出さない。逆引き（症状を選ぶ）は新人向けの補助として残す。

対象ユーザーは**レッスンコーチ本人**。ラウンド中・レッスン中に、生徒の症状から最短で「原因・処方・生徒への言い換え」を取り出し、その場でLINE送信し、**カルテに自動記録**する。入力は「症状チップ＋フリーテキスト＋音声（Web Speech API）」の3系統で、同義語辞書＋タグ＋球筋方向でスコア照合し候補を出す（`lib/coaching.ts` の `matchSymptoms`）。P2でこの照合をClaude API＋コメント資産のRAGに置換・強化する。

3つのモード:
1. **クイック診断**（現Finderの進化形）— 症状を選ぶ/打ち込むと、優先度順の原因候補と処方を提示。ワンタップで生徒LINEへ。
2. **カルテ連携診断** — lesson-osの生徒カルテを開いた状態で診断すると、その生徒の過去コメント・動画・傾向を踏まえた**パーソナライズ提案**。診断結果はそのままカルテのコメントとして保存。
3. **コメント→知識の自動蓄積** — コーチが書いた自由記述コメントをAIが解析し、症状・局面・原因・処方・ドリルにタグ付けして知識ベースに還元。**使うほど賢くなる。**

---

## 3. 堀（他社に真似されない差別化）— 最重要

### 3.1 データフライホイール

```
コーチが実レッスンでコメントを書く（lesson-os / Finder）
        │
        ▼
AI解析（Claude API）: 症状・スイング局面・原因・処方・ドリルを構造化抽出
        │
        ▼
知識グラフに蓄積（sc_knowledge / sc_patterns）— 出現頻度・コーチ支持・生徒改善で重み付け
        │
        ▼
次の診断がより速く・より的確に（候補順位が実データで自動最適化）
        │
        └──▶ コーチはさらに使う ──▶ コメントが増える（先頭へ戻る）
```

このループは**データが増えるほど精度が上がり、後発は追いつけない**。競合が同じUIを作っても、中身の知識は空。GOLF WINGは既に**5,939件・4コーチ・138生徒・平均129字**の実データを保有（下表）。これがゼロ日目の優位。

### 3.2 添付Excel（ウィナーズゴルフ様）の実測（堀の裏付け）

| 指標 | 値 |
|---|---|
| 総コメント数 | 5,939件 |
| ユニーク生徒 | 138名 |
| 稼働コーチ | 4名（張替3,680 / 浅野1,401 / 小林745 / 風間82） |
| 平均コメント長 | 128.9字（＝処方・ドリルまで書かれた濃い記述） |
| ドリル記載 | 1,103件（18%）＝再現可能な処方の宝庫 |
| ノイズ（8字未満/挨拶のみ） | 66件（1%）＝ほぼ全件が有効データ |

局面別の機械抽出（重複あり）: テイクバック/BS 46% ・軸回転/捻転 34% ・アドレス/姿勢 31% ・同調/三角形 30% ・下半身/踏み込み 30% ・ダウン/切り返し 29% ・インパクト/打点 29% ・グリップ/手元 27% ・アプローチ/パター 20%。
→ **キーワードだけでもこの解像度。AI解析なら原因⇄処方の因果まで構造化でき、そのまま知識ベースになる。**

### 3.3 真似されない4層

1. **データ層**: 実コメントコーパス（独占・増殖）。契約時に自社データを持ち込めるのはGOLF WING系のみ。
2. **モデル層**: コメント→構造化のプロンプト資産＋タグ辞書＋重み付けロジック（現場で検証済み）。
3. **運用ロジック層**: 確認優先度の設計、生徒向け言い換えの型＝**現場で1円一致まで検証してきたGenesisの流儀**（SAAS_PLAN §1）。
4. **囲い込み層**: 生徒カルテ・会員・LINE・KPIと繋がるほど乗り換え不能に（後述SaaS）。

---

## 4. アーキテクチャ（Genesis連携）

- **独立アプリ** `apps/swing-cortex`（member-os / lesson-os と同型: 共有DB・別Vercel・middleware認証）。
- **DB共有**: Genesis Supabase（company_id分離 + RLS標準）。スキーマ接頭辞 `sc_`。
- **権限**: `use_coaching`（コーチ）/ `view_hq`（本部）。既存の権限テーブルに追加。
- **AI**: Claude API。コメント解析（バッチ + 逐次）、診断候補生成、生徒向け言い換え。既存の日次cron/OCRと同じ配線。
- **LINE**: 既存の公式LINE配信基盤（gn_line_outbox → n8n）を流用。**YOZAN/GOLF WING 2アカウント混同に注意**（staff-notice の教訓）。
- **KPI**: `refresh_coaching_kpis()` で 診断数・LINE送信率・生徒改善率 → CEO日次レポートへ。
- **カルテ連携**: lesson-os `lsn_students` / `lsn_comments` と member_code で疎結合（FKで縛らない、lesson-os方針を踏襲）。

### 4.1 スキーマ（新規 migration 0069_swing_cortex.sql 想定 / sc_*）

| テーブル | 内容 | 主なカラム |
|---|---|---|
| `sc_symptoms` | 症状マスタ（球筋/体の動き/コースマネジメント等） | id, company_id, category, name, tags[], flight_dir |
| `sc_checkpoints` | 症状ごとの確認項目（優先度順） | id, symptom_id, priority, title |
| `sc_knowledge` | 3点セット本体 | id, checkpoint_id, cause, fix, client_explanation, drill, source |
| `sc_patterns` | AI抽出パターン（コメント→構造化の中間層） | id, company_id, phase, cause_key, fix_key, weight, freq, coach_support |
| `sc_diagnoses` | 診断ログ（誰がいつ何をどう診たか） | id, company_id, coach_staff_id, student_ref, input_text, result_json, sent_line |
| `sc_feedback` | 効いた/効かない（重み付けの源泉） | id, diagnosis_id, outcome(worked/na/worse), note |
| `sc_favorites` | コーチ別お気に入り | coach_staff_id, knowledge_id |
| `sc_import_batches` | Excel/コメント取込の履歴 | id, company_id, source, rows, created_by |

- 全テーブル `company_id` + RLS。新関数は **service_role に EXECUTE 付与必須**（DB権限監査の教訓）。
- 「今日」判定は必ず `lib/jst.ts`（UTC禁止・JST日付ルールの教訓）。
- Vault: 新Vercel/新URLは `vault_systems` 登録必須（Vaultルール）。

### 4.2 コメント→知識パイプライン（堀の実装）

1. **取込**: Excel（WING NOTE書き出し）またはlesson-osの新規コメント。`sc_import_batches` に記録。
2. **解析**（Claude API・バッチ）: 1コメントから `{phase, symptom, cause, fix, drill, client_phrase}` をJSON抽出。ノイズ（挨拶等・実測1%）は破棄。
3. **正規化**: 表記ゆれを `sc_patterns` のキーに寄せる（例「スエー/スウェー」）。
4. **重み付け**: 出現頻度 × コーチ支持（お気に入り/採用）× 生徒改善（sc_feedback）でスコア化 → 診断候補の並び順に反映。
5. **還元**: 新パターンは知識ベースへ。既存は重み更新。**AIは提案・下書きまで、公開反映は本部承認**（AI自律度モデル/VISION §7の線引き）。

---

## 5. UI 全面刷新

### 5.1 現行の問題（使いづらさの原因）

- 情報密度が高すぎる（左リスト＋3タブ＋No.1〜6ボタン＋原因/対処/説明×コピー×4を一画面に詰め込み）。
- **診断の主導線が「自分で症状を探す」**＝コーチの頭の中を頼りにする逆引き辞書。新人ほど使えない。
- コピー系ボタンが4つ並び、どれを押すか毎回迷う。
- モバイル（レッスン現場はスマホ/タブレット）前提の設計になっていない。

### 5.2 再設計の原則（DESIGN_SYSTEM.md 準拠）

- **モバイルファースト**、1画面1目的、余白広め・高級感（Apple/Linear/Stripe参照）。
- ベース色 zinc、アクセントは製品ブランドカラー（プロトタイプは緑〜ティール系。Genesis YOZAN Green `#0F6B4F` と親和）。
- タップ対象 40×40px以上、375pxで崩れない。

### 5.3 画面設計

- **`/` ホーム（診断ハブ）**: 中央に大きな検索/入力欄「生徒の症状は？」。下に「よく使う症状」チップ（実データの頻度順）。最近の診断履歴。＝**3タップで結果に到達**。
- **診断結果（ボトムシート/カード）**: 優先度No.1をデフォルト展開、原因→処方→生徒向け説明を縦1カラムで。**アクションは1つに集約**＝「LINEで送る」大ボタン（＋メニューでコピー/カルテ保存）。
- **`/student/[ref]` カルテ連携**: lesson-osの生徒を開いた文脈で診断。過去コメント要約・傾向タグ・前回処方が上部に出て、提案がパーソナライズ。診断はワンタップでカルテコメント保存。
- **`/library` 知識ライブラリ**: 現Finderの逆引きも残す（ベテラン向け）。カテゴリ→症状→チェック項目。編集は本部権限。
- **`/insights` 本部ダッシュボード**: 症状の流行、コーチ別診断数、処方の効果（sc_feedback）、KPI。
- **`/settings` 設定・データ**: Excel取込（追加/全入れ替え）、JSON書き出し、コメント解析の実行、権限。

### 5.4 使いやすさの要点（Before → After）

| 論点 | 現行 | 新設計 |
|---|---|---|
| 診断の入口 | 症状リストを自分で探す | 症状を打つ/選ぶ→AIが候補提示 |
| 主アクション | コピー4種で迷う | 「LINEで送る」1つに集約＋副次メニュー |
| 記録 | 残らない | 診断が自動でカルテに保存 |
| 端末 | PC前提 | モバイルファースト |
| 賢さ | 静的辞書 | 使うほど順位が最適化 |

---

## 6. SaaS化・課金・オンボーディング（囲い込み層）

- **マルチテナント**: company_id + RLS（既存資産）。顧客ごとに知識ベースは分離、ただし**「業界標準の種知識」は共有シードとして提供**（自社5,939件から匿名化・一般化したもの＝初日から使える）。ここが導入の殺し文句。
- **課金（Stripe）**: 店舗数 × 月額。コーチ席の従量。AI解析はプラン内枠＋従量。請求書払いも法人向けに用意（SAAS_PLAN §2C）。
- **オンボーディング3段**（SAAS_PLAN §2A流用）:
  1. セットアップウィザード（会社・店舗・コーチ・LINE連携を質問形式で）
  2. **AI設定コンシェルジュ**（チャットで「症状を追加」「この処方を全店に反映」→ 危険操作は確認画面）＝相手はシステムを触れない前提の実質管理画面
  3. 導入代行メニュー（既存コメントのExcel取込→解析→知識ベース生成を代行）
- **移行サービス**: 他校のWING NOTE/独自Excelを取込→AI解析で**その校の診断脳を即日生成**。これ自体が乗り換えの強力な動機かつ他社が持たない移行力。
- **囲い込み**: カルテ・会員・LINE・KPIと繋がるほど乗り換え不能。データはエクスポート可能にしつつ（信頼のため）、**運用の一体性で残す**。

### 6.1 販売導線

- 1社目は自社（FRANK GOLF姫路を2テナント目として発行、SAAS_PLAN Phase S0）。
- 外部はファイン福原氏のSales OS流通網（PGA NOTE顧客）へ（SAAS_PLAN §2C）。

---

## 7. リスク・留意

- **セキュリティ**: 現Finderのデモ平文表示は廃止。Genesis認証・RLSに統一。リポジトリは顧客提供時Private必須（SAAS_PLAN §2C）。
- **AI品質**: 解析の誤タグは重み付け前に本部承認（AI自律度モデル）。生徒向け説明は医療類似の断定を避け、コーチが最終確認。
- **LINEアカウント混同**: YOZAN/GOLF WING 2アカウント（staff-notice教訓）。テナントごとに送信元を明示。
- **データ権利**: 顧客コメントの二次利用（共有シード化）は規約で同意取得（Legal OSで管理）。

---

## 8. フェーズ計画

| Phase | 内容 | 成果 |
|---|---|---|
| P0（本書） | 設計 + UIプロトタイプ | 全体像の合意 |
| P1 | `apps/swing-cortex` 雛形 + migration 0069 + Excel取込 + クイック診断 | 自社で稼働 |
| P2 | コメント→知識AIパイプライン + lesson-osカルテ連携 + KPI | データフライホイール始動 |
| P3 | マルチテナント発行ウィザード + Stripe + AI設定コンシェルジュ | 外販開始（FRANK姫路が1社目） |
| P4 | 本部インサイト + sc_feedbackで順位最適化 + 共有シード知識 | 堀の完成 |

---

## 9. P1 実装状況（2026-07-22 実装済み）

- **migration** `supabase/migrations/0069_swing_cortex.sql`（sc_* 9テーブル・RLS標準・updated_atトリガ・starter知識シード）。**未適用**＝ユーザーが適用する。
- **アプリ** `apps/swing-cortex`（Next.js 15 / port 3011 / `@yozan/core` / 権限 `use_coaching`｜`view_hq`）。
  - `login` / `(main)` [`/`診断・`/library`・`/insights`・`/settings`] / `manual` / `api/logout`。
  - **クイック診断**: 症状検索→優先度順チェックポイント→原因/対処/ドリル/生徒向け説明→「LINEで送る」（`sc_diagnoses`にログ）。
  - **Excel取込**（設定）: WING NOTE .xlsx を `xlsx` で解析→`sc_comments`へ、`lib/coaching.ts`のルール分類で局面×症状を`sc_patterns`に集計（追加/全入れ替え）。
  - 分類器 `lib/coaching.ts` は決定的ベースライン（P2でClaude API解析に置換・併用）。
- **検証**: 22ファイル構文チェックOK / 型エラー0（`@yozan/core`のTS2307はサンドボックスのsymlink解決由来で既存lesson-osも同様＝コードの問題ではない。`xlsx`は`npm install`で解決）。
- **未実施（ユーザー作業）**: `npm install`→migration適用→`npm run build`→Vercel作成＋env→`vault_systems`登録→`use_coaching`権限付与→Excel投入。

## 10. P2 実装状況（2026-07-22 実装済み・AI）

堀「レッスンコメント資産×AI」の中核。Genesis既存（ceo-ai/legal-ai）と同型のClaude API配線。

- **`lib/ai.ts`**: `callClaude({system,user})`（`fetch https://api.anthropic.com/v1/messages`・`ANTHROPIC_API_KEY`・モデル`CORTEX_AI_MODEL`>`CEO_AI_MODEL`>`claude-haiku-4-5-20251001`）＋`extractJson`。キー無しは`null`→呼び出し側がテンプレにフォールバック（**必ず出力は返る**）。
- **`lib/data.ts` `findSimilarComments`**: 過去コメント（`sc_comments`）から症状キー・生徒refで近いものを取得（RAG-lite・埋め込みはP3）。**その学校の文体・ドリル名のお手本**をAIに与える源泉。
- **`(main)/ai-actions.ts` `draftComment`**: 診断内容＋コーチ所見＋過去コメント例 → **2種の下書き**をJSONで生成。`structured`＝整形した指導記録（問題点→修正点→ドリル）、`natural`＝自然な話し言葉の文章コメント（LINE・カルテ・メール等どこにでも貼れる汎用文）。**過去コメントの文体を踏襲**が最重要指示。AI失敗/キー無しは決定的テンプレ。`saveKarteDraft`で`sc_diagnoses.result_json`に保存（`lsn_comments`全面連携はP3）。
- **UI**: 診断シートに「この内容でレッスンコメントを作成」→ 所見を口語入力→「AIで下書き」→ **整形版／自然文版を各自に付いたコピーボタンで別々にコピー**（編集可）。特定媒体（LINE等）に縛らず汎用的にコピペ運用。生成エンジン（AI/テンプレ）と参照件数を表示。
- **環境変数（追加）**: `ANTHROPIC_API_KEY`（必須で本領発揮）、任意`CORTEX_AI_MODEL`。未設定でもテンプレで動作。
- **検証**: 新規`ai.ts`/`ai-actions.ts`は構文OK（bashで確認）。編集済ファイルはリポのマウント陳腐化でbashが古い内容を返すためReadツールで実体確認済（完全・整合）。最終ゲートはユーザーPCの`npm run build`。

### P2の使いどころ（現場）
逆引き診断（症状→原因/対処/生徒説明）はレッスン中の即時参照。**コメント作成AI**はレッスン直後、その学校の文体でカルテ記録＋生徒LINEを1〜2タップで作る＝WING NOTE手書きの時間を圧縮。両者が同じ画面で繋がる。

## 11. P3 実装状況（2026-07-22 実装済み・生徒コンテキスト＝コーチのCRM化）

診断・コメントを「生徒」に紐づけて蓄積し、次回は前回の課題を踏まえて提案する。lesson-os全面統合（`lsn_comments`直書き）はP4、まずはsc_内で自己完結。

- **migration `0070_swing_cortex_students.sql`**: `sc_students`（軽量生徒台帳・member_codeで将来lesson-os突合・疎結合）＋`sc_notes`（生徒別の保存コメント＝カルテ。`natural`はPG予約語のため列名`natural_text`）＋`sc_diagnoses.student_id`追加。RLS標準。**未適用**。
- **`lib/data.ts`**: `loadStudents` / `loadStudentNotes`。
- **`(main)/student-actions.ts`**: `createStudent`（新規登録）/ `saveNote`（`sc_notes`へカルテ保存）。
- **`draftComment`（ai-actions）**: `studentId`があれば`loadStudentNotes`で**その生徒の過去カルテ上位3件を文脈に投入**→前回からの継続・変化に触れたパーソナライズ下書き。
- **UI（diagnosis-client）**: ホームに**生徒ピッカー**（検索・新規登録）＋選択中バナー（カルテへのリンク・解除）。Composerに生徒を伝播し、生成をパーソナライズ＋「〇〇さんのカルテに保存」。
- **`/students/[id]`**: 生徒カルテ履歴ページ（保存コメントを新しい順、自然文＋整形版）。
- **検証**: 新規4ファイル（0070/student-actions/students[id]/page）は構文OK。編集済（diagnosis-client/data/ai-actions）はマウント陳腐化のためReadで実体確認（全関数の開閉が整合・626行）。最終ゲートは`npm run build`。
- **未実施（ユーザー）**: migration 0069・0070適用 → `npm install` → `npm run build`。

## 12. P4 実装状況（2026-07-22 実装済み・エディション制＝販売の切り分け）

**販売方針（ユーザー確定）**: 外販は **P2仕様（standard）** で売る。P3（生徒CRM）以降は自社（pro）限定。テナント単位で機能を出し分ける。

- **migration `0071_swing_cortex_plan.sql`**: `sc_settings(company_id PK, plan 'standard'|'pro')`。**行が無ければstandard＝安全側＝売る仕様**。プラン変更はservice_roleのみ（顧客は自分で上げられない）。自社（store code 'golf'）を pro に投入。RLSは自テナントselectのみ。
- **`lib/plan.ts`**: `loadFeatures(companyId)` → `{ plan, studentCrm }`。`studentCrm = plan==='pro'`。将来の機能追加はここに足す。
- **ゲート適用**:
  - `standard` = 診断・ライブラリ・インサイト・設定・**AIコメント作成（整形/自然文）** まで（＝P1+P2）。
  - `pro` のみ = **生徒ピッカー／カルテ保存／`/students/[id]`／過去カルテによるパーソナライズ**（P3）。
  - ホーム（page.tsx）でfeatures解決→`studentCrm`をUIへ。standardでは生徒ピッカー・バナー・保存ボタンを描画せず、`loadStudents`も呼ばない。`/students/[id]` は非proなら `redirect('/')`。設定画面にエディション（PRO/STANDARD）表示。
- **検証**: 新規`0071`/`plan.ts`は構文OK。編集ファイルはマウント陳腐化のためReadで整合確認（banner三項の`))}`、settings/students挿入とも均衡）。最終ゲートは`npm run build`。

### SaaS化の残作業（外部アカウント・意思決定が要るため手順のみ）
1. **Stripe課金**: 店舗数×月額。`sc_settings`に`stripe_customer_id`/`status`列を足し、Webhookでplan切替（standard↔pro↔停止）。Stripeキーはenv/Vault。
2. **テナント発行ウィザード**: 会社・店舗・コーチ・LINEを質問形式→ scaffold（`scripts/new-app`の延長）。初回にExcel取込（コメント資産）まで案内＝即戦力化。
3. **AI設定コンシェルジュ**: チャットで「症状追加」「処方を全店反映」等。危険操作は確認画面（VISION §7）。`callClaude`＋ツール定義で骨格は流用可。
4. **インフラ分離**: 顧客提供時はリポPrivate必須（SAAS_PLAN §2C）、Supabaseは同居＋RLS or プロジェクト分離。
5. **Vault登録・use_coaching権限**・独自ドメイン（お名前.com手順）。

## 13. データの持ち方（DB＝正典 / 2026-07-22 ユーザー方針）

**方針**: 症状項目マスタの正は**DB**（`sc_symptoms / sc_checkpoints / sc_knowledge`）。Excelは「初期投入元」または「書き出しスナップショット」であって台帳ではない。二重管理・版ズレ・多店舗差異を防ぐ。

- **DBへ投入**: `migration 0072_swing_cortex_seed_master.sql`。46症状/53チェック項目を全テナントに starter 配布（`docs/modules/swing-cortex/SWING_CORTEX_項目マスタ.xlsx` と同一データから自動生成）。`sc_symptoms.source`(manual/seed/import/ai)を追加し、`source='seed'` と 0069旧シード(knowledge.source='seed')を消して再投入＝**冪等**。手動/取込/AIで追加した項目は保持。
- **DB→Excel 書き出し**: `GET /api/export`（設定→「項目マスタをExcelで書き出し」）。現在のDB内容を項目マスタと同じ列でxlsx化（SheetJS）。バックアップ・共有・オフライン確認用。
- **Excelの位置づけ変更**: `SWING_CORTEX_項目マスタ.xlsx` は「編集して取り込む台帳」ではなく「seedの元データ／確認用の書き出し」。編集の正はDB。
- **アプリ内編集UI（実装済み 2026-07-22）**: `/manage`（設定→「項目マスタを編集」）。症状（大分類・名前・別名/検索語）と確認項目（優先度・チェック項目・原因・対処・ドリル・説明＝チェック＋知識の1組）をDBで直接**追加・編集・削除**。`(main)/manage/manage-actions.ts`（createSymptom/updateSymptom/deleteSymptom/saveCheckpoint/deleteCheckpoint、company_idスコープ・source='manual'・カスケード削除）＋`loadManageTree`（ID付きツリー）＋`manage-client.tsx`（インライン編集）。全エディションで利用可（standardも自校の項目を編集できる）。**これでDB管理→必要時Excel書き出しが完結**。
- 取込は原文コメント(sc_comments)用と、将来の構造化マスタ取込を分離。

## 付録A. 命名の最終確認事項

- ブランド名（SWING CORTEX で確定するか、代替案から選ぶか）
- アクセントカラー（プロトタイプのティール系 or YOZAN Green統一）
- 1社目テナント（FRANK GOLF姫路で確定か）
