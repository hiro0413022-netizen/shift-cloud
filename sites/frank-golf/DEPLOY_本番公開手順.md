# FRANK GOLF 公式サイト — 本番公開手順（frankgolf.jp）

準備は完了しています（`SITE_URL = https://frankgolf.jp` で再ビルド済み・canonical/OGP絶対URL・sitemap.xml/robots.txt 生成済み・vercel.json 追加済み）。
あとは次の3ステップで公開できます。

---

## ステップ1：サイトをgitに載せてpush（あなたのPCで）

```powershell
cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
git add sites/frank-golf
git commit -m "feat(site): FRANK GOLF 公式サイト（本番・frankgolf.jp）"
git push origin main
```

※ `git add sites/frank-golf` はサイト一式だけをステージします（他アプリのWIPは巻き込みません）。

---

## ステップ2：Vercelで新規プロジェクトとして公開

1. https://vercel.com → **Add New… → Project**
2. GitHubの **`hiro0413022-netizen/shift-cloud`** をインポート
3. 設定：
   - **Root Directory** … `sites/frank-golf` を指定（重要）
   - **Framework Preset** … **Other**（＝静的サイト）
   - **Build Command** … 空欄のまま
   - **Output Directory** … 空欄のまま（Rootをそのまま配信）
4. **Deploy** → 数十秒で `https://frank-golf-xxxx.vercel.app` のような本番URLが発行されます

この時点で「.vercel.app」のURLでサイトは本番公開されます。

---

## ステップ3：独自ドメイン frankgolf.jp を接続

> **Vercelは .jp を販売できません**（TLD .jp 非対応）。**お名前.com など日本のレジストラで `frankgolf.jp` を取得**してください（メールで既にお使いのお名前.comが便利）。

1. お名前.com で **`frankgolf.jp`** を取得（未登録・取得可能を確認済み）
2. Vercel：作成したプロジェクト → **Settings → Domains → Add** に `frankgolf.jp` と `www.frankgolf.jp` を追加
3. Vercelが表示するDNSレコードを、お名前.comのDNS設定に登録：
   - `frankgolf.jp` … **A レコード** → `76.76.21.21`（Vercelが指定する値を使用）
   - `www.frankgolf.jp` … **CNAME** → `cname.vercel-dns.com`
   （※実際の値はVercelの画面に表示されるものを優先してください）
4. DNS反映後（数分〜最大48時間）、Vercelが自動でSSL証明書を発行 → `https://frankgolf.jp` が有効化

---

## 公開後の仕上げ（任意・別タスク）

- **member-os の同意リンク有効化**：`apps/member-os/src/lib/site.ts` の
  `SITE_URL = ""` → `SITE_URL = "https://frankgolf.jp"` にして member-os を再デプロイ
  → `/join-web`・`/trial` の「会員規約」「プライバシーポリシー」がHPのページへのリンクになります
- **公式LINEのURL**（`assets/site-data.js` の `links.line`）を入れる
- **サンプル画像を実写に差し替え**（`assets/img/` 上書き → 再push）
- **特商法・プライバシー・会員規約の法務確認**（草案のまま公開されています）

---

## 補足

- サイトは静的なので**ビルド不要**（Vercelはファイルをそのまま配信）。
- 内容を直したら `git add sites/frank-golf && git commit && git push` で自動再デプロイされます。
- vault_systems への登録（`docs/genesis/OPERATIONS.md`）も忘れずに。
