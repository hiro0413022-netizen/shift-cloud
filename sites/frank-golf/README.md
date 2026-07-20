# FRANK GOLF 公式ホームページ

姫路・土山 **2026年9月2日プレオープン**。静的マルチページHTML（16ページ）。

> **ブランド表記は「FRANK GOLF」で統一**（DECISIONS #66）。`FRUNK` / `FRANCK` は誤りです。
> ただしDB・コードの識別子（`frunk_himeji` / `frunk_members` / `/frunk` ルート）は
> 意図的に旧名のまま残しています（画面には出ません）。

---

## 1. 見る

`index.html` をブラウザで開くだけです。ビルドもサーバーも不要です。

## 2. 中身を直す（いちばんよく使う手順）

### 料金・住所・営業時間などを入れる → `assets/site-data.js` だけ

このファイルの値を書き換えて保存 → ブラウザを再読み込み。それだけです。

```js
store: {
  address: null,        // ← ここを "兵庫県姫路市…" にすると、全ページの住所が一斉に入る
  hours:   null,        // ← null のままなら、画面には自動で「近日公開」と表示される
}
```

**ルール: 値が `null` の項目は、画面に自動で「近日公開」と出ます。**
決まっていない数字を勝手に載せない仕組みです。決まったら null を実際の値に置き換えてください。

### お知らせを追加する → `assets/site-data.js` の `news`

```js
news: [
  { date: "2026-08-01", tag: "お知らせ", title: "…", url: null },
]
```

**0件にすると、トップのNEWSセクションごと自動で消えます**（空の見出しが出ません）。

### 文章を直す

各 `.html` を直接編集してOKです。

### 写真を実写に差し替える（★本番前に）

`assets/img/` の中の各JPGは、いまは**ブランドトーンの抽象サンプル画像**です（実在しない施設の
実写を捏造しないため、あえて抽象にしています）。**同じファイル名で実写に上書きするだけ**で全ページに反映されます。

| ファイル | 使われる場所 | 推奨サイズ |
|---|---|---|
| `hero.jpg` | トップのメインビジュアル背景 | 1920×1200 |
| `concept.jpg` | コンセプト | 1280×720 |
| `play.jpg` | 施設・打席 | 1280×853 |
| `lesson.jpg` | レッスン | 1280×853 |
| `lounge.jpg` | バー・ラウンジ | 1280×853 |
| `community.jpg` | コミュニティ | 1280×853 |

別名で管理したい場合は `assets/site-data.js` の `images` のパスを変えてください。
サンプルを作り直すには `python3 _build_images.py`。

### プレオープン告知バナー（トップ帯・SNS・LINE配布用）

`python3 _build_ogp.py` で生成されます。SNSやLINEにそのまま投稿できます。

| ファイル | 用途 | サイズ |
|---|---|---|
| `assets/banner-wide.jpg` | Web横長・トップの告知帯 | 1200×420 |
| `assets/banner-square.jpg` | Instagram等 | 1080×1080 |
| `assets/banner-line.jpg` | LINEリッチメニュー | 2500×843 |

トップの告知帯は `banner-wide.jpg` を使用。実写バナーに差し替える場合は同名で上書きするか、
`site-data.js` の `images.bannerWide` のパスを変更してください。

### フロア見取り図（施設ページ・トップ）

「打席 → ラウンジ」の動線を伝えるSVGの**イメージ図**を `_build.py` の `floorplan()` で描画しています。
確定レイアウトが出たら、この関数内の打席数・配置を実際に合わせて更新してください（画面に「イメージ図」と明示済み）。

### OGP画像（LINE/SNSで共有したとき出る画像）を作り直す

```bash
python3 _build_ogp.py
```

写真が撮れたら、`assets/ogp.png` を実写ベースに差し替えてください（1200×630）。

### ヘッダー・フッター・共通部分を直す

16ページすべてに同じものが入っているので、`_build.py` を直して再生成してください。

```bash
cd sites/frank-golf
python3 _build.py     # 16ページを上書き再生成
```

> ⚠ `.html` を直接編集した後に `_build.py` を実行すると、その手直しは**消えます**。
> 共通部分の修正と個別の文章修正が混ざるときは、先に `_build.py` を流してから文章を直してください。

---

## 3. ファイル構成

```
sites/frank-golf/
├ index.html          トップ（17セクション：告知バー〜フッター）
├ concept.html        ブランドコンセプト / PLAY・LEARN・CONNECT / FRANKの意味
├ facility.html       施設（打席→ラウンジの「過ごし方」で紹介）
├ lesson.html         レッスン
├ lounge.html         バー・ラウンジ（中心価値）
├ community.html      会員コミュニティ・イベント
├ plan.html           料金・会員プラン・入会の流れ
├ beginner.html       はじめての方へ
├ corporate.html      法人でのご利用
├ access.html         アクセス
├ faq.html            よくあるご質問
├ trial.html          体験のご予約（CTA着地）
├ tokushoho.html      特定商取引法に基づく表記（★草案・法務未確認）
├ privacy.html        プライバシーポリシー（★草案・法務未確認）
├ 404.html            ページが見つからないとき
├ robots.txt
├ assets/
│  ├ style.css        デザイン（黒×ディープグリーン×ブラス）
│  ├ site-data.js     ★可変データ（ここを直す）
│  ├ site.js          データ流し込み・お知らせ・ナビ・演出
│  ├ ogp.png          SNS/LINE共有時の画像（1200x630・自動生成）
│  ├ favicon.svg / favicon.png / favicon-32.png / apple-touch-icon.png
├ terms.html          会員規約（★草案・法務未確認）
├ _build.py           16ページ＋sitemapの生成スクリプト
├ _build_ogp.py       OGP画像・faviconの生成スクリプト
└ README.md
```

---

## 4. 予約・会員ログイン・Web入会（Genesis / member-os 連携）

**このサイトには予約機能を作っていません。** 既存の member-os にすべて揃っているためです。

| 導線 | 飛び先 |
|---|---|
| 会員ログイン | `https://member-os-tau.vercel.app/member/login` |
| 会員Web予約 | `/member/book` |
| Web会員登録（既存会員のWeb予約用） | `/member/register` |
| **体験予約（公開フォーム）** | `/trial`（`links.trialBooking`） |
| **Web入会申込（公開・プラン選択）** | `/join-web`（`links.joinWeb`） |

### 体験申込フォームの送信先を設定する（★体験予約の受け方）

トップ／体験ページの「体験申込フォーム」は、**`site-data.js` の `links.trialForm` に送信先URLを入れると有効**になります。
未設定の間は、フォームは自動的に隠れ、公式LINEでの受付案内が表示されます（壊れません）。

**いちばん簡単な方法：Formspree（無料・登録だけ・メールに届く）**
1. https://formspree.io/ に登録 → New Form を作成
2. 表示された送信先URL（`https://formspree.io/f/xxxxxxx`）をコピー
3. `site-data.js` の `trialForm: null,` を `trialForm: "https://formspree.io/f/xxxxxxx",` に変更
4. 保存 → 以降、フォーム送信内容が指定メールに届きます（氏名・連絡先・第1〜3希望日・経験・要望）

> Getform / Basin など他の「フォーム→メール」サービスでも同様に使えます（POSTでフォーム項目を受ける形式）。

**しっかり運用する方法：Reserve OS（自社の申込型システム）に繋ぐ**
YOZANには既に**申込型予約システム Reserve OS**（`apps/reserve-os`・候補日時3希望＋事前ヒアリング＋スタッフ確定＋メール通知）があります。
体験レッスンを1サービス追加すれば、`https://…/reserve/taiken-himeji` のような公開URLがそのまま体験申込フォームとして使えます。
その場合は本サイトのフォームは使わず、体験ボタンをそのURLに向けるのが簡単です（NEXT_TASKS参照）。

### 体験予約URLの発行手順

1. member-os にログイン → **「予約（姫路）」** を開く
2. **【お客様Web予約URLを発行】** を押す
3. 表示されたURL（`.../book/xxxxx`）を `assets/site-data.js` の `links.trialBooking` に貼る

> URLは発行時に**一度しか表示されません**。発行し直しは何度でも可能です（都度貼り替えが必要）。

**`links.trialBooking` が未設定の間、「体験予約」ボタンは自動的に公式LINEへ飛びます。**
公式LINE（`links.line`）も未設定の場合は、ボタンが「体験予約（近日公開）」になり押せなくなります。

---

## 5. このサイトで守っているルール

書き換えるときも、以下は崩さないでください。

1. **中心メッセージ**は「ただの練習場ではなく、ゴルフが上手くなり、仲間ができる場所」。
2. **バー・ラウンジは補足設備ではない**。中心価値として独立セクションを持たせています。
3. **交流を強制する施設に見せない**。「一人で集中したい日も歓迎」を必ず併記します（`.note-solo`）。
4. **経営者目線の言葉は対顧客サイトでは禁止**。
   「省人モデル」「無人店舗」→「スマート入退室」「完全予約制」「待ち時間なく利用できる」
   「落ち着いた少人数制の練習環境」に置き換えます。
5. **未確定の情報を勝手に作らない**。`site-data.js` に置いて「近日公開」に任せます。
6. **主なCTAは「体験予約」と「公式LINEで相談」の2つ**。資料請求は作りません。
7. プレオープン日は **「2026年9月2日」と年を含めて**表記します。

---

## 6. SEO / MEO（検索・地図対策）

実装済み:

- **構造化データ（JSON-LD）**: 全ページにパンくず、トップに `GolfCourse`／`SportsActivityLocation`、FAQページに `FAQPage`。
- **meta**: `description`（ページ別）／`keywords`（姫路 インドアゴルフ 等）／OGP＋Twitter Card＋`og:image:alt`。
- **対応エリア**: アクセスページに姫路市・たつの市・太子町・揖保郡・高砂市・加古川市を明記（MEO）。
- **画像 alt**: すべてにローカルキーワードを含む代替テキスト。
- **sitemap.xml / robots.txt**: `SITE_URL` 設定後に自動生成。
- **canonical**: `SITE_URL` 設定後に自動付与。

**ドメイン確定後に必ずやること（`_build.py` の `SITE_URL` を設定して再ビルド）**:
`SITE_URL` が空の間は、OGP画像が相対パス（LINEで画像が出ない）、canonical と sitemap が出力されません。

**MEO（Googleマップ）で確定後に追記すべき項目**（`_build.py` の `jsonld_business()` 内 TODO）:
`telephone` / `geo`（緯度経度）/ `openingHoursSpecification`（営業時間）/ `priceRange` / `sameAs`（SNS URL）。
あわせて **Googleビジネスプロフィール**の登録（NAP＝店名・住所・電話をサイトと一字一句そろえる）を強く推奨します。

---

## 7. 公開（未実施）

Vercelに上げる場合は、Root Directory を `sites/frank-golf` にした新規プロジェクトを作り、
フレームワークプリセットは **Other（静的）** で構いません。ビルドコマンドは不要です。
公開時は `docs/genesis/OPERATIONS.md` の手順に従い **vault_systems への登録**を忘れずに。

### ⚠ 公開前に必ずやること

0. **写真を実写に差し替え**（`assets/img/` 上書き）。現状はサンプルです。
1. **`_build.py` の `SITE_URL` にドメインを入れて `python3 _build.py` を再実行**
   - 空のままだと og:image が相対パスになり、**公式LINEでURLを送っても画像が出ません**
     （LINE・X・Facebookのクローラは絶対URLを要求します）
   - `sitemap.xml` もこの設定後に自動生成されます（未設定のときは意図的に出力しません）
2. **`tokushoho.html` / `privacy.html` の法務確認**
   - 現状は**草案**です。画面上にも「準備中の草案」と明示しています。
   - 特に**Web上での入会申込・決済を始める前**は、特定商取引法に基づく表記の確定が必須です。
