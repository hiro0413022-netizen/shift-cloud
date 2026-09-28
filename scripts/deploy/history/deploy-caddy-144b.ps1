# ============================================================
# #144 / #144b Caddy OS
#   1) 出勤希望が来ていないキャディも割り当てられることを明示（候補を3グループに）
#   2) この日の出勤希望をカレンダー内で代理入力（押すたび 空欄→○→△→×）
#   3) 派遣を触ったら 派遣台帳・カレンダー・キャディ台帳・提出CSV・請求 を必ず作り直す
#   4) 「登録のある月」ボタンを追加。月がずれているだけと分かるようにした
#
# 使い方: 右クリック →「PowerShellで実行」
# migration なし（コード反映のみ）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/3] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] コミット..." -ForegroundColor Cyan
git add -- "apps/caddy-os/src" "docs/genesis/DECISIONS.md"
git status --short
git commit -m "caddy-os: 派遣を触ったら5画面すべてを作り直す＋月がずれているだけと分かるようにした (#144b)" -m @"
小川さん報告「派遣台帳が過去の分と入力した分が見れない」「カレンダーに登録したのに表示されない」

原因は2つ。

(1) revalidate漏れ
    派遣台帳から登録/削除/請求月変更をしても /calendar /ledger /exports を作り直しておらず、
    同じ cad_dispatches の行を見ている他の画面が古いままだった。
    revalidateDispatchViews() に集約して6画面すべてを必ず作り直す。
    カレンダー側の assignDispatch は元から全部呼べていた＝入口によって整合性が変わる状態だった。

(2) 月スコープが画面に出ていない
    派遣台帳もカレンダーも表示中の1か月しか出さないため、月がずれているだけで
    「過去の分が消えた」「登録したのに出ない」と同じ見え方になる。実データは無傷（332件）。
    - components/month-nav.tsx を新設。登録のある月と件数をボタンで並べ1タップ移動
    - 表示中の月が0件なら「消えたわけではありません。直近は 2026/08（12件）です」とリンク案内
    - まとめて登録の上に「別の月で登録すると、その月に切り替えるまで一覧には出ません」と明記
    - getMonthCounts() を lib/caddy.ts に追加（日付だけ引いてJSで集計・RPCは増やさない）

あわせて #144（出勤希望が無いキャディも割り当て可能なことを明示＋希望の代理入力）も含みます。

検証: caddy-os の tsc クリーン。migrationなし。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9
"@

Write-Host "[3/3] push（Vercel が caddy-os を自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分でデプロイされます。" -ForegroundColor Green
Write-Host "確認: https://caddy-os-omega.vercel.app/dispatches に「登録のある月」ボタンが並ぶこと" -ForegroundColor Gray
