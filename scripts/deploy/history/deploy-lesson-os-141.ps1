# ============================================================
# #141 Lesson OS: FRANK予約カレンダー→カルテ直行 / 会員・退会の自動同期 /
#      トラックマン写真のAI取込 / 撮影ガイド廃止
#
# 使い方: PowerShell でこのファイルを実行するだけ
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-os-141.ps1
#
# migration 0119 は Supabase へ適用済み（このスクリプトはコード反映のみ）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

# 他セッションの未コミット分を巻き込まないよう、今回の変更だけを明示的に add する
git add -- `
  "supabase/migrations/0119_lesson_frank_sync.sql" `
  "apps/lesson-os/src/lib/trackman.ts" `
  "apps/lesson-os/src/lib/trackman-ai.ts" `
  "apps/lesson-os/src/app/(main)/m" `
  "apps/lesson-os/src/app/(main)/page.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/karte-client.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/measure-panel.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/page.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/swing-recorder.tsx" `
  "apps/lesson-os/src/app/api/export/route.ts" `
  "apps/lesson-os/public/manual.md" `
  "apps/member-os/src/lib/frank-reservation.ts" `
  "apps/member-os/src/components/booking-detail.tsx" `
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx" `
  "docs/genesis/DECISIONS.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "Lesson OS: FRANK会員・退会の自動同期、予約カレンダーからカルテ直行、トラックマン写真のAI取込、撮影ガイド廃止 (#141 / 0119)" -m @"
- 0119: frunk_members に trg_sync_frank_member_karte。member_no が付いた時点で lsn_students を find-or-create、
  退会(left/rejected)は status=inactive に落とす。既存4名はバックフィル済み（有効会員4名中カルテ0件だった）
- lesson-os /m/<会員番号>: 会員番号→カルテIDに解決してリダイレクト。無ければその場で作る
- member-os: 予約詳細・レッスン枠・会員カードから「レッスンカルテを開く」でその会員のカルテへ。
  レッスン枠には予約者を表示。会員カードの旧ボタンは生徒の共有ページだったのでラベルを分離
- lesson-os 計測タブ: トラックマン1ショット画面の写真 → 端末で縮小 → Claude Vision で22項目読取 →
  全項目を人が修正 → lsn_measurements へ確定保存。単位は換算せず _units に保持、AI生結果は ai_raw に別保存
- 生徒一覧・CSV: 退会者は既定で非表示、「退会者も表示」で開ける
- 撮影ガイド線（GuideDTL/GuideFaceOn とアングル切替）を廃止。説明テキストが枠外で切れていた
- fix: 動画単位のアクションが company_id しか見ておらず他店舗の動画を操作できた（#134の徹底漏れ）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017nQhgkA9MgirJV91C6m3PJ
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel の lesson-os / member-os が READY になるか確認してください。" -ForegroundColor Green
Write-Host "残作業: Vercel lesson-os に ANTHROPIC_API_KEY を追加 → Redeploy（AI読取に必要）" -ForegroundColor Yellow
Write-Host "        ロール「コーチング（店舗）」に use_lesson を付与（NEXT_TASKS A-2）" -ForegroundColor Yellow
