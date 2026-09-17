# HP管理（ホームページのノーコード編集＋閲覧数）— #249

3サイト（YOZAN コーポレート / FRANK GOLF / KALLINOS）を1つの管理画面で更新する仕組み。
ブログ・写真・文言・Instagram の差し替えと、閲覧数・Google検索の表示回数を見る。

- 管理画面: `apps/hp-admin`（Vercel `yozan-hp-admin`・https://yozan-hp-admin.vercel.app ・git連携 root=apps/hp-admin）
- 表示側: `apps/corporate`（yozan-inc.jp・サーバー描画）／`sites/frank-golf/assets/hp.js`（frankgolf.jp）／`apps/kallinos/js/hp.js`（www.kallinos.jp）。静的の2サイトはブラウザで `hp_public_site` を読む
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
- 流入元は `?src=` / `utm_source` が最優先。無ければ referrer のホストで google / yahoo / bing / instagram / facebook / line / x / youtube / tiktok / ai / other / direct（youtube・tiktok は 0187）。
  サイト内の移動は `internal`（集計の「どこから来たか」からは除外）。

## Google Search Console

- サービスアカウント方式。オーナーが管理画面「設定」で JSON を貼る → `hp_settings.gsc_sa`（service_role 専用）。
- サイトごとのプロパティ（`sc-domain:xxx` か `https://xxx/`）を `hp_settings.gsc_properties` に。
- 数字タブを開いたときに 12時間に1回だけ取り込み（`gsc_sync`）。直近90日を入れ替え（初回は480日）。日次合計（dim=total）と日×キーワード（dim=query）。
- **サービスアカウントのメールを各プロパティのユーザーに追加しないと 403**。yozan-inc.jp は Search Console 未登録（2026-09-17時点）。

## FRANK GOLF（#249c）
- 枠のキー = `img.<site-data.js の images のキー>`。hp.js が `window.FRANK.images` を上書きして `FRANK_RENDER()`（site.js の init 再実行）
- トップ「新着情報」= site-data.js の news ＋ Genesis /site-admin のお知らせ ＋ HP管理のブログ（日付順・8件まで）
- 「お店の様子」= Instagram（0件なら非表示）。`blog.html` = 一覧／`blog.html?slug=` = 記事（`_build.py` の build_blog）
- **hp.js は site.js より前**（foot() と booking.html / lesson-booking.html の手書き部分）
- 検索で上げたい読みものは HP管理ではなく `_build.py` の INTENT_COLUMNS（#229）に書く（クライアント描画はSEOが弱い）

## KALLINOS（#249c）
- `<img data-hp-img="index.look1">` / `<div data-hp-bg="index.hero">` → 枠 `img.index.look1` など
- `[data-hp-ig]`（トップの仮グリッド）は登録があるときだけ埋め込みに置き換え。`site.instagram_url` でフォローボタンの行き先
- お知らせ = トップの `[data-hp-news-section]`（0件なら非表示）と `news.html`（`?slug=` で記事）

## 記事のURL（サイトごとに違う）
- YOZAN `/blog/<slug>` ／ FRANK `/blog.html?slug=<slug>` ／ KALLINOS `/news.html?slug=<slug>`
- 計測のパスは3サイトとも `/blog/<slug>`（記事別の閲覧数を同じ集計で出すため）。管理画面は `postUrl()` / `pageUrl()` で変換

## Search Console（2026-09-17 設定）
- Google Cloud プロジェクト `yozan-hp-admin`（ID causal-guide-508908-f3・hiro0413022@gmail.com）／サービスアカウント `hp-admin-gsc@causal-guide-508908-f3.iam.gserviceaccount.com`
- 鍵は hp_settings.gsc_sa（鍵を作り直したら HP管理「設定」で貼り直す）
- プロパティ: frank-golf=`https://frankgolf.jp/`／yozan=`https://yozan-inc.jp/`／kallinos=`https://www.kallinos.jp/`（3つとも所有権確認・サービスアカウント追加・設定済み 2026-09-17。yozan・kallinos は新規登録のためデータが溜まるまで数日0件）
- 所有権確認は `google2b364b4dcd5146c9.html`（3サイト共通・hiro0413022 のトークン）。**消さない**。yozan-inc.jp は meta も併用。yozan-inc.jp の sitemap.xml は送信済み
- サービスアカウントの権限は「フル」（画面で「制限付き」に切り替えられなかった。コードは readonly スコープ）
