# Night OS

ナイトビジネス（キャバクラ / ガールズバー・ラウンジ）の **電子伝票 ＋ 給与計算**。
会計ソフトではない。狙いは「毎月の締めで店長が消耗するのをやめる」こと。

- テーブル接頭辞: `nite_*`（migration 0151〜0154）
- 権限: `use_night` または `view_hq`
- ポート: 3013
- 店舗: いまは1店舗。`stores.code = 'night-himeji'` で解決する（member-os の `resolveHimeji()` と同型）

## なぜこの作りなのか

**締めが大変になる本当の原因は「後から誰の分か分からなくなること」。**
だから伝票の1行ごとに担当キャスト（`nite_slip_items.cast_id`）を持たせ、
担当が空の行が残っている伝票は **DB側で閉じられない**（`app.nite_slip_close_guard`）。
月末に突き合わせる作業そのものを無くす。画面の作りには頼らない。

**明細は消さない。** 取り消しは `status='void'` にするだけで行は残す。
夜の店は入力も取り消しも多く、「消えた伝票を説明できない」のが一番まずい。

**計算の正典は1か所。** 時給アップ・指名・同伴・ドリンク・ボトルのバックは
`@yozan/core/night-payroll` だけに書く。iPadの表示・キャストの明細・月次の締めが
同じ関数を通るので、1円もズレない。回帰テストは `tests/night-payroll.test.ts`。

**ルールと確定金額を分ける。** バック設定は `nite_rulesets.rules(jsonb)` に版として持つ。
確定した金額は `nite_slip_items.back_amount` / `nite_payroll_lines` に焼き付けるので、
あとで設定を変えても過去の給与は動かない。

## 画面

| URL | 誰が | 何をする |
|---|---|---|
| `/floor` | ボーイ（店舗iPad） | 卓一覧・ご案内・出勤打刻 |
| `/slips/[id]` | ボーイ（店舗iPad） | 伝票。タグ→種類→「誰の分か」の2ステップで追加 |
| `/owner` | オーナー・店長（スマホ） | 本日の売上・人件費率・キャスト日当 |
| `/owner/closing` | オーナー・店長（スマホ） | 月次の締め（集計→確認→確定→明細送付）・税理士用CSV |
| `/settings/backs` | オーナー・店長 | バック設定＋前日実績でのシミュレーション |
| `/cast` | キャスト（スマホ） | 今月の見込み給与・日払い・今日の内訳 |
| `/cast/shift` | キャスト（スマホ） | シフト提出（締切カウントダウン付き） |

キャストのログインは **携帯番号＋4桁の暗証番号**（`nite_cast_sessions`）。
スタッフの Supabase Auth とは別系統。給与が見える画面なので「名前を選ぶだけ」にはしない。

## 残っていること

- シフト締切のLINEリマインド（`nite_shift_periods.remind_days` は入っているが送信はまだ）
- 確定した明細のキャストへの送付（いまは画面で見えるところまで）
- 複数店舗（いまは `night-himeji` 固定）
- 遅刻控除の自動計算（ルールはあるが `late_minutes` の入力口がまだ）

## デプロイ

OPERATIONS.md §「新アプリ デプロイ定型チェックリスト」の通り。
Vercel は Root=`apps/night-os`、env 3つ（`NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`）。

> ローカルの Cowork VM では `next build` が Bus error になる（SWCのネイティブが動かない）。
> 型チェックは `npx tsc --noEmit -p tsconfig.tscheck.json` で通る。ビルド確認は Vercel 側で行う。
