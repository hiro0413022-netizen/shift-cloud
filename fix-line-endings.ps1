# 作業ツリーの改行コードをLFに統一する（2026-07-17・一度だけ実行）
#
# これで直る問題:
#   ClaudeのVMからは、CRLFのファイルが「\rの個数ぶん末尾を切られた状態」で見えていた。
#   そのためgitが844ファイル中803ファイルを勝手に「変更あり」と認識し、
#   Claudeがcommit/pushすると壊れた中身が入る危険があった（＝毎回手動デプロイが必要だった）。
#   gitのblobは元々LFなので、作業ツリーをLFに直すだけ。中身は1文字も変わらない。
#
# 注意: このファイルは必ず「BOM付きUTF-8」で保存すること。
# Windows PowerShell 5.1 はBOMが無い .ps1 をCP932として読むため、日本語が化けて構文エラーになる。
#
# 実行方法（commit-and-deploy.ps1 を先に済ませてから）:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\fix-line-endings.ps1

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host ""
Write-Host "[1/6] 未コミットの変更が無いか確認します..." -ForegroundColor Cyan
Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
Remove-Item ".git\HEAD.lock" -Force -ErrorAction SilentlyContinue
$dirty = git status --porcelain
if ($dirty) {
    Write-Host "未コミットの変更があります。先に commit-and-deploy.ps1 を実行してください。" -ForegroundColor Red
    Write-Host "（このスクリプトは作業ツリーを作り直すため、未コミットの変更は消えます）" -ForegroundColor Red
    git status --short
    exit 1
}

Write-Host "[2/6] このリポジトリではCRLF変換をしない設定にします..." -ForegroundColor Cyan
git config core.autocrlf false
git config core.eol lf

Write-Host "[3/6] 作業ツリーをLFで作り直します（中身は変わりません）..." -ForegroundColor Cyan
git rm --cached -r . -q
git reset --hard | Out-Null

Write-Host "[4/6] 検証: 変更ゼロになったか..." -ForegroundColor Cyan
$after = git status --porcelain
if ($after) {
    Write-Host "まだ差分が残っています。Claudeに以下を見せてください:" -ForegroundColor Yellow
    git status --short | Select-Object -First 20
} else {
    Write-Host "  OK: git status はクリーンです" -ForegroundColor Green
}

Write-Host "[5/6] 検証: 末尾切れが無いか..." -ForegroundColor Cyan
node scripts/check-files.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "末尾切れが検出されました。Claudeに報告してください。" -ForegroundColor Red
    exit 1
}

Write-Host "[6/6] 完了" -ForegroundColor Cyan
Write-Host ""
Write-Host "これ以降はClaudeが自分でcommit & pushできるようになります。" -ForegroundColor Green
Write-Host "Claudeに「LF統一おわった」と伝えてください。VM側から検証します。"
