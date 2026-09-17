# HP管理（ホームページのノーコード編集＋閲覧数）— #249

3サイト（YOZAN コーポレート / FRANK GOLF / KALLINOS）を1つの管理画面で更新する仕組み。
ブログ・写真・文言・Instagram の差し替えと、閲覧数・Google検索の表示回数を見る。

- 管理画面: `apps/hp-admin`（Vercel `yozan-hp-admin`・https://yozan-hp-admin.vercel.app ・git連携 root=apps/hp-admin）
- 表示側: `apps/corporate`（yozan-inc.jp）。FRANK / KALLINOS は未接続（`hp_sites.live=false`）
- DB: `hp_*`（migration 0184 / 0185）
- Edge Function: `hp-admin`（写真アップロード・Search Console 取り込み）。ソース控え `supabase/functions/hp-admin/index.ts`
- ログイン: `hp_users`（Supabase Auth とは別）。初期パスワードは Vault（`vault_systems` の「HP管理（氏名）」）

## しくみ

```
管理画面(ブラウザ) ──RPC(anonキー＋セッショントークン)──▶ hp_admin_* (SECURITY DEFINER・中で hp__user が検査)
                  └─multipart / JSON────────────────▶ Edge Function hp-admin ──service_role──▶ Storage hp-media / hp_gsc_daily
ホームページ(サーバー) ──RPC(anon)──▶ hp_public_site / hp_public_post（公開中だけ・60秒キャッシュ）
ホームページ(ブラウザ) ──RPC(anon)──▶ hp_track（閲覧を1件記録）
```

- **テーブルは全部 RLS ON・ポリシー無し・anon/authenticated から REVOKE**。読める経路は RPC だけ。
- 管理画面は env を持たない（URL と anon キーは公開前提の値を `src/lib/config.ts` に直書き）。権限判定はすべてDB側。
- セッショントークンは `hp_sessions` に sha256 だけ保存・30日。パスワードは bcrypt。8回失敗で15分ロック。
- `role='owner'` は全サイト＋Search Console 設定。`editor` は `hp_users.sites` のサイトだけ（初期は3サイトとも）。

## 差し替え枠（hp_slots）

- `value` が空なら `default_value` を使う。「元に戻す」＝ value を null。
- 写真枠のキーは `<ページ>.photoN`（ページ内で上から N 番目の写真）。`apps/corporate` 側は `pic(slots, key, IMG.x)`。
- 文言枠: `home.hero_title`（`【】`で囲んだ文字は金色・改行そのまま）/ `home.hero_lead` / `home.cap3〜7` / `site.instagram_url`。
- **枠を増やすときは** ①コード側で `pic()` / `text()` を通す ② `hp_slots` に行を足す（label はお客様目線の場所の説明）。
  既定写真は本番の絶対URL（`https://yozan-inc.jp/images/...`）で入れる → 管理画面のプレビューに出る。表示側はローカルパスに戻す。

## ブログ本文の書式（lib/body.ts・管理画面と表示側で同じファイルを持つ）

`## 見出し` / `### 小見出し` / `- 箇条書き` / `![説明](URL)` / `[文字](URL)` / `**太字**`。HTMLは全部エスケープ。
**body.ts を直したら apps/hp-admin と apps/corporate の両方に同じ変更を入れる。**

## 閲覧数（hp_page_views）

- `apps/corporate/src/components/Tracker.tsx`。Cookie は使わず localStorage の乱数ID（訪問者）と sessionStorage（セッション）。
- localhost・`?preview`・自動操作ブラウザ（navigator.webdriver）は数えない。同じ人・同じページの10秒以内は1回。
- 流入元は `?src=` / `utm_source` が最優先。無ければ referrer のホストで google / yahoo / bing / instagram / facebook / line / x / ai / other / direct。
  サイト内の移動は `internal`（集計の「どこから来たか」からは除外）。

## Google Search Console

- サービスアカウント方式。オーナーが管理画面「設定」で JSON を貼る → `hp_settings.gsc_sa`（service_role 専用）。
- サイトごとのプロパティ（`sc-domain:xxx` か `https://xxx/`）を `hp_settings.gsc_properties` に。
- 数字タブを開いたときに 12時間に1回だけ取り込み（`gsc_sync`）。直近90日を入れ替え（初回は480日）。日次合計（dim=total）と日×キーワード（dim=query）。
- **サービスアカウントのメールを各プロパティのユーザーに追加しないと 403**。yozan-inc.jp は Search Console 未登録（2026-09-17時点）。

## FRANK GOLF / KALLINOS をつなぐとき（次の段）

1. `hp_slots` に枠を足す（FRANK は `sites/frank-golf/assets/site-data.js` の images が候補）
2. 表示側で `hp_public_site('frank-golf')` を読む（FRANK は静的サイト＝`cms.js` と同じくブラウザで読むか、`_build.py` で焼く）
3. `Tracker` 相当のビーコンを入れる → `hp_sites.live = true`
4. FRANK の既存 CMS（Genesis `/site-admin`・`gn_site_content`）はお知らせと予約設定。お知らせは hp_posts に寄せるか要判断
