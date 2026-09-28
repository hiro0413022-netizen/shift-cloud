# ============================================================
# #175/#176/#177 Lesson OS: クラブ軌跡・スイングプレーン・画角の再現（三脚なし運用）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-swing-177.ps1
#
# ※ migration 0129 / 0130 は適用済み
# ※ 前回の deploy-lesson-club-fix-176.ps1 をまだ実行していない場合も、この1回で全部入ります
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0130_lesson_club_plane.sql" `
  "apps/lesson-os/src/lib/pose.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/video-player.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/swing-recorder.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/karte-client.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
  "apps/lesson-os/public/manual.md" `
  "tests/lesson-swing-analysis.test.ts" `
  ".gitignore" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "lesson-os: クラブ軌跡・スイングプレーン・前腕を使った底上げ・三脚なしの画角合わせ (#175-#178)" -m @"
【クラブ検出（実動画で検証して作り直し）】
- スロー撮影ではコマ間でクラブがほとんど動かず1コマ前との差分にシャフトが写らない。
  比較するコマ間隔を1/2/4/8/12から自動で選ぶようにした（これが主因）
- 光線に直角方向の幅／中心-周りのridge／画面実測の閾値／fill を組み合わせ、
  候補4本から動的計画法で1本を選ぶ（前のコマの続き＋クラブ長が体格に対して一定）
- 実動画363コマ中246コマでヘッド検出。アドレス〜トップ〜フォローまで線が乗ることを確認

【前腕を事前情報にしてクラブ検出を底上げ（#178）】
- シャフトの向きは前腕（肘→手首）から±10度以内に収まることを実データで確認。
  前腕から見て有り得ない向きの候補を落とすと、画面の反対側を向いた誤検出がほぼ消える
- 手首のコックのなめらかさをDPの遷移コストに追加
- 取れなかったコマは前腕から補う。外挿はせず、空きすぎ／コックが飛ぶ区間は埋めない
- 実測はオレンジ実線・推定は青い点線で必ず区別。「実測◯コマ・推定◯コマ」も表示

【三脚なしで画角を合わせる】
- 撮影画面に【👻 前回に重ねる】。前回スイングの1コマ目をプレビューに薄く重ねる。
  人と打席が重なるように立てば画角が揃う（枠線ガイドは復活させない）
- 解析結果に「📷 正面72° ・体の大きさ 61%」を表示。肩幅÷(肩〜足首)から撮影方向を推定。
  前回と近ければ角度も比べられる、とコーチが自分で判断できる
- 頭のブレとプレーンからの離れ(%)は体の大きさで割ってあり距離に依存しないことを明記

tests 25件（新規）・全462件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019tqPLjbyozp5ayJsLTALHm
"@

git push origin main

Write-Host ""
Write-Host "push 完了。READY になったら:" -ForegroundColor Green
Write-Host " 1) 保存済みの動画で【解析し直す】→ クラブ軌跡が出るか" -ForegroundColor Green
Write-Host " 2) 同じ生徒でもう1本撮影 → 撮影画面に前回が薄く重なるか" -ForegroundColor Green
