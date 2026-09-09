# ============================================================
# #229 公式サイト SEO/AI検索対策（frankgolf.jp）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-seo-229.ps1
#
# ※ Claude 側の環境では git の一時ファイルを消せず commit が途中で止まったため、
#    残った .git/HEAD.lock をここで片付けてから進めます（他に git を動かしていないことが前提）
# ※ push すると Vercel が sites/frank-golf を自動デプロイします（migration なし）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

if (Test-Path ".git\HEAD.lock") { Remove-Item -Force ".git\HEAD.lock" }
if (Test-Path ".git\index.lock") { Remove-Item -Force ".git\index.lock" }

git add -- `
  "sites/frank-golf" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "deploy-frank-seo-229.ps1"

$left = git status --porcelain -- "sites/frank-golf" | Where-Object { $_ -match '^\?\?' }
if ($left) {
  Write-Host "⚠ sites/frank-golf に未追加のファイルが残っています:" -ForegroundColor Red
  $left | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
  throw "未追加のファイルがあるため中止しました"
}

git status --short

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "frank-site: Google検索とAI検索で見つかるようにした（SEO/AIO） (#229)" -m @"
ユーザー指示:
  フランクゴルフのグーグルでのSEO対策して、上位表示されるようにしてください。
  検索キーワードによって見出しやトップページを変えるようにしてください
  （初心者 スクール → 初心者ならフランクゴルフへ）。ホームページ内のブログに飛ぶ感じ。
  グーグルの上位表示される仕組みにしてください。AI用対策もしてください。

1. 住所・営業時間・料金をHTMLに焼き込み（Googlebot が「近日公開」を読んでいた）
2. 検索意図ごとの記事10本＋トップ「お悩みから探す」（キーワード別の出し分けはクローキングになるので記事で対応）
3. 全ページのタイトルに地域KW・トップH1に「姫路・土山のインドアゴルフスクール」・FAQの古い回答を確定情報に
4. JSON-LD: GolfCourse→SportsActivityLocation、geo/郵便番号/料金Offer。ホームの正規URLを / に統一（/index.html は301）
5. 会員用予約画面・広告LP・404 を noindex
6. AI検索向け: llms.txt、robots.txt でAIクローラー明示許可、FAQPage 構造化データ、トップに定義文＋基本情報

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W9FojdSY72i5oqY3c9W6PX
"@
}

git push origin main
Write-Host ""
Write-Host "✅ push 完了。Vercel のデプロイが終わったら（1〜2分）次を確認:" -ForegroundColor Green
Write-Host "   https://frankgolf.jp/           → ソースに「兵庫県姫路市土山6-6-1」が入っている"
Write-Host "   https://frankgolf.jp/llms.txt   → 表示される"
Write-Host "   https://frankgolf.jp/column.html"
Write-Host "   https://frankgolf.jp/index.html → / に転送される"
Write-Host "そのあと Search Console で sitemap.xml を再送信してください。"
