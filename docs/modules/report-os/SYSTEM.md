# Report OS — 事業所別 月次資料 自動生成システム

> 正典。設計判断は本書、実作業は NEXT_TASKS、方針は docs/genesis/VISION.md を参照。

## 1. 目的

事業所ごとの「月次報告資料（.pptx）」を、**数値は自動・文章はAI下書き**でほぼ自動生成する。
古川さんは最後に「承認 / 修正」だけ。VISION §3「CEO AIが毎月出すもの」の月次アウトプット層。

第1本丸は **GOLF WING**。型を完成させて FRUNK / KALLINOS / YOZAN 全体へ横展開する。

## 2. 資料の構成（GOLF WING）

生成される .pptx は8枚：

1. 表紙（事業所名・対象月）
2. 今月のサマリー（会員数・体験予約・入会率・退会率・物販売上・フィッティングの6KPI。各カードに前月比・前年比）
3. 会員数の推移（12ヶ月ラインチャート＋前月比・前年比・年間純増）
4. 物販売上・フィッティング（12ヶ月バーチャート＋当月実績）
5. 月間の実施事項（AI下書き）
6. 問題点の洗い出し ／ 実施予定（解決策）（AI下書き・左右対応）
7. その他 情報共有事項（AI下書き）
8. 指標一覧（全KPIの当月/前月/前月比/前年/前年比の表）

## 3. データソースと自動化レベル

**データの真実（DECISIONS #22/#28・member-os準拠）**：Smart Helloの3ファイルを member-os `/import` に取り込む（`importMembers`/`importWalkins`/`importReservations`）。report-osはそのテーブルを読む。

| 項目 | 正ソース（テーブル / 取込） | 状態 |
|---|---|---|
| 会員数（正会員） | `mbr_members`（会員名簿→`importMembers`）を §4-Aルールで集計 | ✅ 名簿取込で自動（2026-06=210） |
| 会員種類名の構成・除外区分 | `mbr_members.member_type` | ✅ 名簿取込で自動 |
| 退会率・新規入会・退会者数・退会予定 | `mbr_members.join_date/leave_date` | ✅ 名簿取込で自動 |
| **体験（trial）・フィッティング（fitting）** | **`mbr_walkin_visits`（一時利用者名簿→`importWalkins`）** visit_type別・visited_on月次 | ⏳ 一時利用者名簿の取込待ち |
| **入会率（入会/体験）** | 会員名簿の当月入会数（`mbr_members.join_date`）÷ 一時利用の当月体験数（`mbr_walkin_visits` trial）。※体験非経由の直接入会も含むため100%超あり（ユーザー定義2026-07）。2026-06=9÷7=128.6% | ✅ 名簿＋一時利用で実数 |
| **打席稼働・パーソナル件数** | **`mbr_reservations`（予約一覧→`importReservations`）** program_type/place/staff、status≠キャンセルで集計 | ⏳ 予約一覧の取込待ち |
| 在籍スタッフ・人件費・労働時間 | Shift Cloud → `kpis`（0008） | ✅ 自動 |
| 月次売上・営業利益 | 財務モジュール `fin_entries`（0009） | ⚠️ 財務入力が前提 |
| 会員数の月次推移 | `mbr_members` から算出（当面は入会日再構成／将来 `kpis.trend`蓄積） | ⚠️ 参考値（過去の退会者未反映） |
| **物販売上** | 売上データxlsx（品目「販売」税込）。将来はMoney OS `mon_sales`（現状23行のみ・未接続） | ✅ 売上データで実数（2026-06=¥1,174,200）。DB自動化は要取込 |
| 打席稼働・パーソナル件数 | 予約一覧 `mbr_reservations`（program_type=パーソナル等、キャンセル除外） | ✅ ファイルで実数（6月パーソナル30） |
| 実施事項・問題点・解決策・情報共有 | 現場メモ＋数値 → Claude API | 🤖 AI下書き（人が承認） |

> ⚠️ **予約一覧の体験数・フィッティング件数は使わない**：キャンセル時に予約を削除しない運用のため過大。体験・フィッティングの正は一時利用者名簿（`mbr_walkin_visits`）。予約一覧は**打席稼働・パーソナル監視**に用いる。

> ⚠️ **会員数の定義差**：`kpis.code='members'`（`refresh_smart_hello_kpis`）は現状「在籍−スタッフ」（モニター/法人2枚目/トライアルを含む＝約219）。report-osの正会員（210）とは定義が異なる。Genesis Cockpitと資料を一致させるには `refresh_smart_hello_kpis` を4区分除外に合わせる（要マイグレーション。次フェーズ）。

**結論**：会員系は名簿取込で自動化可能（骨格完成）。残ギャップは①一時利用者名簿の取込（体験/フィッティング/入会率）②予約一覧の取込（打席稼働/パーソナル）③物販売上のソース確定④会員数KPI定義の統一。

## 3.5 毎月の運用フロー

1. Smart Helloから3ファイルをエクスポート：**会員名簿 / 一時利用者名簿 / 予約一覧**。
2. member-os `/import` に3ファイルをアップロード（`importMembers`→mbr_members＋KPI更新、`importWalkins`→mbr_walkin_visits、`importReservations`→mbr_reservations）。
3. report-os `build-data.mjs` がDBを読み＋Claude APIで文章下書き→ `generate.js` で当月.pptx生成。
4. 古川さんが承認・修正 → 配布。

## 4. データソースのDB整備（migration 0047 で完了）

> **ステータス（2026-07-14 / migration 0047 適用済み）**
> 4-A2（会員数スナップショット）と 4-B（物販売上）はDB化完了。以降 report-os は **ビュー `v_rpt_monthly` 1本**を読めばよい。
>
> | 追加物 | 中身 |
> |---|---|
> | `rpt_retail_sales` | 物販売上の月次記録（company_id/store_code/ym/amount税込/source）。売上データxlsx（品目「販売」税込）から 2022-06〜2026-06 の49ヶ月をバックフィル済（source=`sales_xlsx`）|
> | `rpt_member_snapshots` | 正会員数の月次スナップショット（members/new_joins/leavers/excluded_counts）。2022-06〜2026-06 バックフィル済 |
> | `report_member_counts(company_id, ym)` | §4-A の正会員ルールの**正典実装**（除外4区分・当月末退会者を除く） |
> | `snapshot_member_count(company_id, ym)` | 上記をスナップショットに積むRPC（月初のスケジュールタスクが実行） |
> | `v_rpt_monthly` | 月次集計ビュー: `members / new_joins / leavers / retail_sales / fittings / trials` |
>
> **フィッティング用の `rpt_fittings` は作らない**。一時利用者名簿（`mbr_walkin_visits.visit_type='fitting'`）が正ソースとして取込済みのため、二重管理を避けビューで集計する。
> **既知の限界**: 会員推移・退会率は名簿の join_date/leave_date 再構成のため、名簿から消えた過去の退会者を含まない参考値（過去月の退会率が0になる）。正確な推移は今後 `rpt_member_snapshots` の毎月積み上げで担保される。

### 4-0. 旧・ギャップ一覧（設計時のメモ）

### 4-A. 会員数のカウントルール（正会員の定義）

会員数 ＝ **正会員のみ**。次の区分は会員数に含めず、資料には小さく別掲する：
**モニター・スタッフ・法人二枚目・トライアル**。
また **当月末退会者は当月の会員数に含めない**（例：7月末退会者は7月の会員数から引く）。
**表記は会員名簿の「会員種類名」どおり**に出す（ラベルを言い換えない）。

**会員名簿の実際の会員種類名（会員種類名列, 会員名簿_20260707確定）**：
`レギュラー会員・マスター会員・チケット会員・ライト会員・レギュラー家族割会員・法人会員・プラチナレギュラー会員`（正会員）
＋ 除外4種 `スタッフ・モニター会員・法人会員2枚目・トライアル会員`。

**除外区分の確定マッピング**（当初の要確認は名簿で解決済み）：
- 「法人二枚目」＝ 会員種類名 **「法人会員2枚目」**（独立した会員種類名。2026-06末在籍5）。
- 「トライアル」＝ 会員種類名 **「トライアル会員」**（会員名簿に存在。2026-06末在籍2）。
- 「モニター」＝**「モニター会員」**、「スタッフ」＝**「スタッフ」**。

**2026-06末 実績**（会員名簿_20260707から算出）：正会員210（レギュラー会員134・マスター会員35・チケット会員17・ライト会員9・レギュラー家族割会員7・法人会員5・プラチナレギュラー会員3）。除外＝スタッフ15・モニター会員7・法人会員2枚目5・トライアル会員2。6月新規入会9・退会0・退会予定10（7/31に8・8/31に2）。

名簿 `mbr_members` は `member_type`（会員種類名）・`class_name`・`join_date`・`leave_date`・`leave_reason` を持つ（現状空。上記xlsxを取込めば自動算出）。除外配列 `:excluded = ['スタッフ','モニター会員','法人会員2枚目','トライアル会員']`。想定SQL：

```sql
-- 除外する種別
-- member_type in ('モニター','スタッフ','法人二枚目','トライアル')

-- 当月末時点の正会員数（当月＝:ym の 'YYYY-MM'）
select count(*) as members
from mbr_members
where company_id = :cid
  and member_type is distinct from all (array['モニター','スタッフ','法人二枚目','トライアル'])
  and join_date <= (date_trunc('month', :ym::date) + interval '1 month - 1 day')::date
  and (leave_date is null or leave_date > (date_trunc('month', :ym::date) + interval '1 month - 1 day')::date);

-- 当月の退会者数 / 新規入会数
select
  count(*) filter (where leave_date >= date_trunc('month', :ym::date)::date
                     and leave_date <  (date_trunc('month', :ym::date) + interval '1 month')::date) as leavers,
  count(*) filter (where join_date  >= date_trunc('month', :ym::date)::date
                     and join_date  <  (date_trunc('month', :ym::date) + interval '1 month')::date) as new_joins
from mbr_members where company_id = :cid;

-- 除外区分の内訳（当月末在籍）
select member_type, count(*) v
from mbr_members
where company_id = :cid
  and member_type in ('モニター','スタッフ','法人二枚目','トライアル')
  and (leave_date is null or leave_date > (date_trunc('month', :ym::date) + interval '1 month - 1 day')::date)
group by member_type;
```

※ 実際の `member_type` の表記（値）は取込む名簿に合わせて確定する。資料側の除外リスト・ラベルは JSON の `kpi.members.excluded[]` と `kpi.members.rule` で制御。

### 4-A2. 会員数スナップショットの月次蓄積
上記ルールで算出した**正会員数**を `kpis.trend` に毎月1日積む。既存の refresh 関数と同型で、月次スナップショットを追記するRPC（`snapshot_member_count(company_id)`）を追加し、月初にスケジュール実行。過去分は名簿の `join_date`/`leave_date` から1回だけバックフィル。

### 4-B. 物販売上・フィッティングの記録テーブル
最小構成（`rpt_` プレフィックス、company_idスコープ、RLSは既存標準に準拠。DATABASE_STANDARD.md）：

```
rpt_retail_sales   (company_id, ym date, amount numeric, source text, note text)
rpt_fittings       (company_id, occurred_on date, member_id, staff, club_type, resulted_in_purchase bool, note)
```

- 物販はレジ/売上CSVの月次取込、またはMoney OSの物販科目から集計。
- フィッティングは受付/レッスン記録から。当面は月次の件数入力でも可（Genesisの入力フォーム）。
- これらから月次集計ビュー `v_rpt_monthly(company_id, ym, retail_sales, fittings)` を作り、生成時に読む。

## 5. 生成パイプライン

```
[1] build-data  ── Supabase(kpis / v_rpt_monthly / trend) を読み、数値JSONを組み立て
       │             物販/フィッティング/会員推移が無い月は「要入力」フラグ
       ▼
[2] narrative   ── 数値の変化＋現場メモを Claude API に渡し、
       │             実施事項・問題点・解決策・情報共有の下書きを生成 → JSONに合流
       ▼
[3] generate.js ── JSON → .pptx（pptxgenjs、本リポジトリ apps/report-os/generate.js）
       ▼
[4] 承認         ── 古川さんが確認・修正（CEO Inbox / Genesis画面）→ 確定・配布
```

- **[1]+[2] の実装**: `apps/report-os/build-data.mjs`（雛形あり）。Supabase service_role で読み取り、`ANTHROPIC_API_KEY` でClaude呼び出し。
- **[3]**: 完成・稼働中。`node generate.js data/<事業所>-<YYYY-M