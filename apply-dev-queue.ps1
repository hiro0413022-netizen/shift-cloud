# ============================================================
# 開発依頼キューの取り込み（DECISIONS #183）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\apply-dev-queue.ps1
#
# 何をするか:
#   クラウド側（毎時のスケジュールタスク）が実装して検証まで通した差分を
#   取ってきて、この作業ツリーに当てて commit & push します。
#   push だけは必ずこのPCから行う、という運用（2026-08-17）を守るための1本です。
#
# 初回だけ: 合言葉を1回だけ置いてください（リポジトリはpublicなので中に書きません）
#   New-Item -ItemType Directory -Force "$env:USERPROFILE\.yozan" | Out-Null
#   Set-Content -NoNewline "$env:USERPROFILE\.yozan\dev-queue.key" "<Vercelの CRON_SECRET と同じ値>"
#
# 確認だけしたいとき（当てない・pushしない）:
#   .\apply-dev-queue.ps1 -DryRun
# ============================================================
param([switch]$DryRun)

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

$Base = "https://yozan-genesis.vercel.app"
$KeyFile = Join-Path $env:USERPROFILE ".yozan\dev-queue.key"

if (-not (Test-Path $KeyFile)) {
  Write-Host "合言葉が見つかりません: $KeyFile" -ForegroundColor Red
  Write-Host "次の2行を1回だけ実行してください（値は Vercel の yozan-genesis > Settings > Environment Variables の CRON_SECRET）:" -ForegroundColor Yellow
  Write-Host '  New-Item -ItemType Directory -Force "$env:USERPROFILE\.yozan" | Out-Null'
  Write-Host '  Set-Content -NoNewline "$env:USERPROFILE\.yozan\dev-queue.key" "<CRON_SECRETの値>"'
  exit 1
}
$Secret = (Get-Content -Raw $KeyFile).Trim()
$Headers = @{ Authorization = "Bearer $Secret" }

# ---- 取り込み待ちを取得 ----
try {
  $res = Invoke-RestMethod -Uri "$Base/api/dev-queue/pending" -Headers $Headers -Method Get
} catch {
  Write-Host "取得に失敗しました: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "合言葉が違うか、Vercel に DEV_QUEUE_SECRET / CRON_SECRET が入っていない可能性があります。" -ForegroundColor Yellow
  exit 1
}

if ($res.count -eq 0) {
  Write-Host "取り込み待ちはありません。" -ForegroundColor Green
  exit 0
}

Write-Host "取り込み待ち $($res.count) 件" -ForegroundColor Cyan
foreach ($it in $res.items) {
  Write-Host ("  - {0}  （{1}ファイル / {2}）" -f $it.title, $it.files_changed, $it.verified) -ForegroundColor Gray
}
if ($DryRun) { Write-Host "`n-DryRun なのでここで終わります。" -ForegroundColor Yellow; exit 0 }

# ---- 作業ツリーが汚れていたら止める（人の途中作業を巻き込まない）----
$dirty = git status --porcelain -- ':!*.ps1'
if ($dirty) {
  Write-Host "`n作業ツリーに未コミットの変更があります。先に片付けてください:" -ForegroundColor Red
  git status --short
  exit 1
}

git checkout main | Out-Null
git pull --ff-only origin main

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$okCount = 0

foreach ($it in $res.items) {
  Write-Host "`n=== $($it.title) ===" -ForegroundColor Cyan

  $patchFile = Join-Path $env:TEMP ("devq-" + $it.id + ".patch")
  # パッチは LF のまま書く（PowerShellの既定だとCRLFに化けて git apply が落ちる）
  [System.IO.File]::WriteAllText($patchFile, $it.patch, $utf8NoBom)

  # --3way: このPCの main がパッチ作成時点より進んでいても、可能な範囲で合流させる
  git apply --3way --whitespace=nowarn -- $patchFile 2>&1 | Write-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "当てられませんでした。この依頼は保留に戻します。" -ForegroundColor Red
    git checkout -- . 2>$null
    git reset --hard HEAD | Out-Null
    $body = @{ id = $it.id; error = "git apply --3way が失敗（base_sha=$($it.base_sha)）" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$Base/api/dev-queue/applied" -Headers $Headers -Method Post -ContentType "application/json" -Body $body | Out-Null
    Remove-Item $patchFile -ErrorAction SilentlyContinue
    continue
  }
  Remove-Item $patchFile -ErrorAction SilentlyContinue

  git add -A
  $msg = "$($it.title) (dev-queue)"
  git commit -m $msg -m @"
$($it.result_note)

依頼（原文）: $($it.said)
検証: $($it.verified)
基点: $($it.base_sha)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
"@ | Out-Null

  git push origin main
  if ($LASTEXITCODE -ne 0) {
    Write-Host "push に失敗しました。コミットは残っているので、直してから再度 push してください。" -ForegroundColor Red
    exit 1
  }

  $sha = (git rev-parse HEAD).Trim()
  $body = @{ id = $it.id; commit_sha = $sha } | ConvertTo-Json
  Invoke-RestMethod -Uri "$Base/api/dev-queue/applied" -Headers $Headers -Method Post -ContentType "application/json" -Body $body | Out-Null
  Write-Host "push 完了 ($($sha.Substring(0,7)))" -ForegroundColor Green
  $okCount++
}

Write-Host ""
Write-Host "$okCount 件を取り込んで push しました。Vercel のデプロイを待ってください。" -ForegroundColor Green
Write-Host "migration が含まれる依頼は、Supabase で該当の .sql を流すのを忘れずに。" -ForegroundColor Yellow
