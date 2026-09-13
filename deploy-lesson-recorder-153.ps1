# ============================================================
# #153 Lesson OS 撮影: カウント 0秒/3秒 選択 ＋ iOSでプレビューが再生されない不具合の修正
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-recorder-153.ps1
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/lesson-os/src/app/(main)/students/[id]/swing-recorder.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/karte-client.tsx" `
  "apps/lesson-os/public/manual.md" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "lesson-os: 撮影カウントを0秒/3秒の選択式に、iOSで撮影直後のプレビューが再生されない不具合を修正 (#153)" -m @"
- カウントダウン: 秒数の隣に【カウント なし/3秒】を追加。既定は「なし」＝押した瞬間に録画開始。
  選択は localStorage に記憶（lsn.rec.countdown / lsn.rec.limit）。3秒固定（#143）は一人撮り前提だった
- iOS で撮影直後のプレビューが再生も表示もされない不具合を修正。原因は Blob の type に codecs が
  付いたまま（video/mp4;codecs=avc1...）で、iOS Safari がその type の blob: をメディアとして読めないこと。
  素の video/mp4 / video/webm に正規化した
- 同じ文字列が Storage の Content-Type にも入っていた（＝一覧からの再生も iOS では出ない）。
  アップロード側も正規化。本番の既存1件は storage.objects の mimetype を video/mp4 に更新済
- プレビューを三段構えに: 枠を固定高さ（高さ0に潰れるのを防ぐ）→ 失敗したら data: URL で再試行
  → それでも駄目なら1コマ目の静止画＋「登録すれば一覧から再生できます」を表示
- サムネイル(poster)は撮影直後に1回だけ作り、Captured.poster で登録処理へ渡す（作り直しをやめた）
- MediaRecorder の webm で duration が Infinity になる件の定番回避を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01APMg2tdUXdbCsd3nb4unzM
"@

git push origin main

Write-Host ""
Write-Host "push 完了。lesson-os が READY になったら iPhone でカルテ→撮影を試してください。" -ForegroundColor Green
