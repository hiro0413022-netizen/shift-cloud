# @yozan/prospect — 営業先の自動ピックアップ（正典）

HP制作の営業パイプライン ③→①→② のうち **①**。
DECISIONS **#110** / migration **0098** / パッケージ `packages/prospect` / 画面 demo-sales `/sources`

関連: [@yozan/track（③閲覧計測）](../track/SYSTEM.md) / [AI DEMO SALES](../demo-sales/) / ②`@yozan/outreach` は未着手

---

## 1. 何を解決したか

これまで営業先は手で探して手で登録していた（13件・すべて `source='manual'`）。
つまり **古川が手を動かした日だけ営業先が増える**状態で、パイプラインの入口が人の稼働に縛られていた。

①の役割は「入口を人から外すこと」。

```
巡回元(prs_sources)
   ↓ 取得アダプタ（公開名簿 / Google Places）
候補(ProspectCandidate)
   ↓ 重複除外(prs_seen ＋ dedupe)
営業先(dms_prospects, source='auto')
   ↓ Web現況スコア(audit → analysis.items / score)
採点済み
   ↓ スコア上位を自動デモ生成(auto_demo_at)
デモ完成 → Genesisの判断フィードに「送るか」だけが出る
```

**人が判断するのは最後の1回だけ**にする、というのがこの設計の狙い。

## 2. どこで動くか（重要）

**Vercel Cron が叩く。ブラウザ操作でもローカル実行でもない。**

| | |
|---|---|
| エンドポイント | `apps/demo-sales/src/app/api/cron/prospect/route.ts` |
| スケジュール | `apps/demo-sales/vercel.json` — 20:00 UTC（JST 翌5:00）と 23:00 UTC（JST 8:00）の2回 |
| 認証 | `Authorization: Bearer ${CRON_SECRET}`（Genesisのcronと同方式） |
| middleware | `/api/cron` を公開プレフィックスに追加済み（登録漏れは #90 の事故） |

2回に分けているのは、**1回で終わらせない前提**だから。外部サイトの取得は遅く件数も読めないので、
`budgetMs` を超えたらそこで止め、次のtickが続きから進む（#107 で決めた「途中から再開できること」と同じ考え方）。

## 3. テーブル（0098）

| テーブル | 役割 |
|---|---|
| `prs_sources` | 巡回元。`kind`='directory'（公開名簿ページ）/'places'（Google Places API） |
| `prs_seen` | 巡回済みの参照先。**営業先にしなかった理由も残す**（残さないと毎回同じページを取りに行く） |
| `prs_runs` | 実行ログ。自動化は「静かに止まる」のが最悪の壊れ方なので必ず1行残す |
| `dms_prospects` 追加列 | `prs_source_id` / `source_url` / `audited_at` / `audit` / `auto_demo_at` |

`analysis` は**所見**（AIや人が書き換える）、`audit` は**観測値**（上書きしない）。同じ場所に混ぜると、
人が直した所見を次のcronが機械の値で潰す。

## 4. Web現況スコア（`src/audit.ts`）

取得済みHTMLだけを見る**純粋関数**。ネットワークは `http.ts` に隔離してある。

評価は 1〜5（5が良い）で、demo-sales の `ANALYSIS_ITEMS` と同じキーに入る＝画面でそのまま見える／人が上書きできる。

- **機械で測る**: `ssl`（httpsで着地したか）/ `mobile`（viewport・メディアクエリ）/ `updated`（本文中の最新の西暦）/
  `cta`（`tel:`リンク・予約の文言・フォーム）/ `speed`（PageSpeed。無ければ取得時間と重さ）/ `volume`（本文字数・内部リンク）/
  `design`（`table`/`font`レイアウトか、近年のCSSか）/ `photos` / `hours` / `access` / `first_visit` / `staff` / `recruit`
- **総合営業スコア `score`（0-100）は「改善余地の大きさ」**。`mobile` を最重（26点）に置いているのは、
  スマホで見られないことが最も強い提案材料であり、営業の当たりに直結するため。
- サイトが取れなかった先は **0点にせず40点**（中位）に置く。消すと人の目に触れなくなる。

**文字コードは必ず見る**（`http.ts` の `decodeHtml`）。古いサイトほど Shift_JIS が残っており＝まさに営業対象。
UTF-8決め打ちだと本文が文字化けし、「情報量が少ない・更新が古い」と**誤って高得点**になる。

## 5. 重複を許さない（`src/dedupe.ts`）

自動で拾い続ける仕組みで重複を許すと、②outreach で**同じ医院に2通目を送る**という取り返しのつかない事故になる。

- 電話一致 → 同一（移転・改称で名前だけ変わることがある）
- サイト一致 → 同一
- 屋号一致 → **同じ市のときだけ**同一（「たなか歯科」は全国にある）。市が不明な側があれば安全側に倒す

## 6. 巡回の作法

- User-Agent に会社名と連絡先を書く（`http.ts` の `UA`）
- `robots.txt` を読み、Disallow なら取りに行かない（`src/robots.ts`）
- 同一サイトへの連続アクセスは `delayMs`（既定1.2秒）空ける
- 1回の上限は `prs_sources.max_per_run`（既定10件）

**「営業お断り」の表示を検出したら `caution_points` に残し、デモも作らない。**
作れば送りたくなるので入口で止める。この判定は②outreach の送信除外にもそのまま使う。

## 7. 自動デモ生成

`onDemo` コールバックで demo-sales の `createAutoDemo` を呼ぶ（パッケージは `renderDemo` を知らない＝アプリ非依存）。

- 条件: `status='analyzed'` かつ `score >= 55` かつ `auto_demo_at is null` かつ「営業お断り」でない
- 上限: 1実行3件
- **既にデモがある営業先は触らない**（自動で版を上げると、面談中に見せている画面が変わる）
- 中身は業種テンプレートの仮データ（※仮ラベル付き）。**AIに文章を書かせていない** — 送る前に必ず人が見る前提なので、
  下書きの品質より「作られていること」が重要

## 8. 業種（#110で非医療を追加）

`salon`（美容室・理容室）/ `esthe`（エステ・ネイル）/ `restaurant`（飲食店）を追加した。
医療広告ガイドラインの規制対象外なので、お客さまの声・施術前後の写真・価格の打ち出しが使える＝**デモの勝ち筋が医療系と違う**。

そのため `templates.ts` に **語彙層（`IndustryVocab` / `vocabOf`）** を入れた。省略した項目は医療系の既定値になるので、
既存11業種のテンプレートは触っていない。これが無いと美容室のデモに「院長あいさつ」「ご来院の流れ」が出る。

名簿は診療科が混在するため、`guessIndustry()` がページの文言から業種を寄せる（拾えなければ巡回元の設定のまま。勝手に `other` に落とさない）。

## 9. 環境変数

| 変数 | 場所 | 無いとどうなるか |
|---|---|---|
| `CRON_SECRET` | demo-sales | **cronが401で動かない**（必須） |
| `GOOGLE_PLACES_API_KEY` | demo-sales | Placesの巡回元だけ自動skip。名簿巡回は動く |
| `PAGESPEED_API_KEY` | demo-sales | `speed` を取得時間で代用（他項目は影響なし） |
| `PROSPECT_MAX_NEW` / `PROSPECT_MAX_AUDITS` / `PROSPECT_DEMO_SCORE_MIN` / `PROSPECT_MAX_DEMOS` / `PROSPECT_BUDGET_MS` | demo-sales | 既定値（30 / 25 / 55 / 3 / 240000）で動く |

## 10. 壊しやすい点

- **`/api/cron` を middleware の公開プレフィックスに入れ忘れる** → 307でcronが静かに死ぬ（#90と同じ事故）
- **`analysis` に機械の値を直接書き続ける** → 人が直した所見が翌朝消える。観測値は `audit` に置くこと
- **`prs_seen` に「拾わなかった理由」を書き忘れる** → 毎回同じページを取りに行き、外部サイトに無駄な負荷をかける
- **重複判定を通さずに `dms_prospects` へ insert する** → ②outreach で二重送信になる
- **Places の FieldMask を広げる** → 課金階層が上がる。id/displayName/address/phone/website/mapsUri に留める

## 11. 次（②へ）

②`@yozan/outreach`（送信・配信停止・抑止リスト・法定表示・日次スロットル）。
必要になる法務メモは [[hp-sales-pipeline]] に記載のとおり:
特定電子メール法3条1項3号（サイトにアドレスを公表している営業者へは同意なし送信可・「営業お断り」表示がある先は除外）／
4条の表示義務。到達率のため送信専用ドメイン＋SPF/DKIM/DMARC＋1日30〜50通のウォームアップ。
**「営業お断り」の検出は①で済ませてある**（`audit.noSolicit` / `caution_points`）。
