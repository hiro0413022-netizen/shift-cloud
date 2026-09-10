# Compe OS — ゴルフコンペ管理（正典）

DECISIONS **#232**（2026-09-10）。genspark で動いていた単一HTMLのコンペ管理システムを GENESIS に移設したもの。

- アプリ: `apps/compe-os`（独立アプリ・別Vercel・DB共有・port 3014）
- 権限: `use_compe` または `view_hq`
- テーブル: `cmp_*`（migration `0156_compe_os.sql`）
- 計算の正典: `packages/core/src/compe-score.ts`（テスト `tests/compe-score.test.ts`）

## 1. なぜ作り直したか

旧システムは **1ユーザー＝JSON 1本**（genspark の `golf_savedata.data_json`）だった。
そのため次の3つが構造的に起きていた。

1. **コンペが1個しか持てない**。次の回を作ると前の回が上書きされるか、別スロットとして行方不明になる。
2. **同じ人が2つの組に残る**。組は参加者IDの配列で、ドラッグ＆ドロップの取りこぼしを誰も検知できず、
   案内文とスコアシートで人数が食い違う。
3. **ペリアの式が2か所にあった**（`index.html` と `leaderboard.html`）。隠しホールの配列が食い違っても気づけない。

移設では、コンペを台帳（`cmp_comps`）にし、組メンバーに一意索引を置き、式を `packages/core` の1か所に集約した。

## 2. データの形

| テーブル | 役割 | 注意 |
|---|---|---|
| `cmp_comps` | コンペ本体。案内文・受付列・アンケート項目もここ | `reception_fields` / `survey_questions` / `sheet_cols` は jsonb |
| `cmp_participants` | 参加者 | **会員名簿(`mbr_members`)とは繋がない** — ビジター・取引先・同伴者が普通に入るため |
| `cmp_groups` / `cmp_group_members` | 組と、その中身 | `participant_id` に**一意索引**＝1人がいる組は0か1 |
| `cmp_scores` | 入力されたスコアだけ | GROSS/HCP/NET/順位は**保存しない**（毎回計算する） |
| `cmp_prizes` | 景品 | 表彰後に受賞者名も入れられる |
| `cmp_teams` | 団体戦のチーム | 集計式が回ごとに違うのでスコアは人が入れる |
| `cmp_receipts` | 発行した領収書の控え | 番号はコンペ内で一意 |

RLS は有効・ポリシーなし（service_role 専用 / DECISIONS #3・#65）。認可はアプリ層 `requireActor()`。

## 3. 計算（compe-score.ts）

- **GROSS** = `direct_gross` があればそれ、無ければホール合計（未入力ホールは0扱いにしない）
- **シンペリア** HCP = (隠し6穴の合計 × 3 − 72) × 0.8
- **ダブルペリア** HCP = (隠し12穴の合計 × 1.5 − 72) × 0.8、`peria_double36` は上限36
- **NET** = GROSS − HCP（ペリア競技では申告HCPを使わない）
- **同点は同順位**にして `tied` を立てる。旧システムは配列順で先に登録した人が自動的に上位になっていた。
  ゴルフ規則の同スコアはマッチングカードで人が決めるので、システムは「並んでいる」ことを見せるところまで。

コースパーは 72 固定。コース別パーを持たせるときは `DEFAULT_COURSE_PAR` を引数化する（式を画面側に書かない）。

## 4. 画面

`/` コンペ一覧 → `/c/[id]` 以下にタブ。
ダッシュボード / コンペ設定 / 参加者 / 受付 / 組み合わせ / 案内文 / 領収書 / スコアシート / 個人戦 / 団体戦 / 景品 / アンケート。

印刷はすべて `/c/[id]/print/[doc]`（`announcement` `reception` `scoresheet` `board` `sheet` `teamboard` `prizes` `survey` `receipts`）。
用紙サイズ・向き・色はクエリ（`?size=a3&orient=landscape&theme=navy`）＝**同じ設定のURLをそのまま再印刷・共有できる**。
旧システムの Blob + `window.open` 方式はポップアップブロックで詰まっていたので、普通のページ＋`window.print()` にした。

## 5. まだやっていないこと

- **リアルタイム リーダーボード**（会場の大型モニター向け・30秒更新）。ユーザー判断で後回し（旧 `leaderboard.html` 相当）。
- スコアの多人数同時入力。今は1画面ずつ保存する素直な作り。
- 会員名簿との名寄せ（同じ人が毎回別レコードになる）。必要になったら `cmp_participants.member_id` を足す。
