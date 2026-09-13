# ============================================================
# #145 ゴルフ場提出: 仮のままでも提出可能に ／ CSVとPDFの両対応
# #146 ゴルフ場ごとの色分け ／ 確定と仮をひと目で見分けられるように
#
#   - /exports に「仮も含めて出す」チェックを追加
#     仮を混ぜたときは 状態列・表題（予定表）・注記・ファイル名(_予定) の4か所で明示
#   - PDF 出力を新設（/exports/pdf・pdf-lib＋NotoSansJP・A4縦・複数ページ）
#   - 色＝ゴルフ場 / 形＝状態（確定=塗り+実線、仮=白地+破線+「仮」）
#     カレンダー・派遣台帳・提出画面に適用し、凡例を常時表示
#
#   ※ pdf-lib / @pdf-lib/fontkit を caddy-os に追加したので npm install を通します
#
# 使い方: 右クリック →「PowerShellで実行」
# migration なし
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] npm install（pdf-lib の追加を package-lock に反映）..." -ForegroundColor Cyan
npm install --no-audit --no-fund

Write-Host "[3/4] コミット..." -ForegroundColor Cyan
git add -- "apps/caddy-os" "docs/genesis/DECISIONS.md" "package-lock.json"
git status --short
git commit -m "caddy-os: 仮のままでも提出できるCSV/PDF出力＋ゴルフ場ごとの色分け (#145 / #146)" -m @"
小川さん依頼
  「月間派遣一覧をゴルフ場に送るとき仮の状態でも提出できるようにしたい」
  「csvとPDFどちらの形でも提出できるように」
  「ゴルフ場ごとに色分けをしてわかるようにしてほしい」
  「確定と仮もぱっとみで判断つくようにしておいて」

#145 提出まわり
  - /exports に「仮も含めて出す」チェックを追加（既定は従来どおり確定のみ）
  - 仮を混ぜたときは 状態列 / 表題（日程表→予定表）/ 注記 / ファイル名(_予定) の4か所で明示。
    黙って混ぜると「確定したはず」の事故になるため、混ぜるなら見えるようにするのが条件
  - カレンダー表書式は 確定=○ / 仮=△ で描き分け、凡例行を末尾に追加
  - PDF出力を新設 /exports/pdf?ym=&client=&kari=1
    pdf-lib + NotoSansJP（subset埋込は禁止・#129と同じ理由）、A4縦・罫線つき・複数ページ対応、
    宛名（ゴルフ場名 御中 / ご担当者）・集計行・仮の注記入り
  - PDFは画面から行データを受け取らず getMonthBoard から作り直す
    （URLを直接叩かれても中身を差し替えられないように）

#146 色分け
  - src/lib/client-colors.ts に集約。色＝ゴルフ場 / 形＝状態
  - 色は取引先IDのハッシュで決める（表示順だと1社増えるたび全部ずれて覚え直しになる）
  - 状態は色で表さない。確定=塗りつぶし+実線、仮=白地+破線+「仮」の文字
    （色覚特性・白黒印刷・店頭の照明を考えると色だけの区別は危険）
  - Tailwind v4 はクラス名を静的に走査するのでパレットはベタ書き
  - カレンダー（日セル・日パネル・凡例）／派遣台帳（取引先セル・凡例）／提出画面に適用

検証: caddy-os の tsc クリーン。migrationなし。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9
"@

Write-Host "[4/4] push（Vercel が caddy-os を自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分でデプロイされます。" -ForegroundColor Green
Write-Host "確認1: /exports で「仮も含めて出す」にチェック → CSV と PDF が出せること" -ForegroundColor Gray
Write-Host "確認2: /calendar と /dispatches でゴルフ場ごとに色が付き、仮が破線で出ること" -ForegroundColor Gray
