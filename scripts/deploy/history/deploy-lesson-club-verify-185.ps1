# ============================================================
# #185 クラブ軌跡「線は出ているのに中身が腕だった」を止める
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-club-verify-185.ps1
#
# ※ migration なし
# ※ 誤検出していた既存2本の軌跡はDB側で消去済み（解析し直せば作り直されます）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/lesson-os/src/lib/pose.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/video-player.tsx" `
  "apps/lesson-os/public/manual.md" `
  "tests/lesson-swing-analysis.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "deploy-jarvis-wake-184.ps1"

git status --short

git commit -m "lesson-os: 出来上がった軌跡がクラブかを検査する。腕をなぞった線を返さない (#185)" -m @"
「まだクラブヘッド軌道をうまく取れていない」を本番データで確認した。

分かったこと: 線は出ていた。中身が腕だった。
  video 71fb30cd = 147コマ中146コマで線・確からしさ75%と報告
    ヘッドの縦の動き 156px（体は661px）
    ヘッドが一度も手元より下に来ていない
  ゴルフスイングではアドレスとインパクトで必ず手元より下を通る。
  黙って間違っているのは、取れないことより悪い。

原因: 撮影が通常速度だった（実測 23〜24コマ/秒）。
  手元だけで1コマ体の8.6〜18%動く。ヘッドはその3〜4倍。
  差分は線ではなく扇形になり、放射スキャンではゆっくり動く腕が勝つ。
  #176 が成功した検証動画は1スイングが12秒364コマのスロー撮影だった。

conf/fill では弾けない。腕はきれいに並ぶので高得点を出す。
出来上がった軌跡の形そのものを見るしかなかった。

入れた検査 verifySwingTrack:
  - ヘッドが一度も手元より下に来ない → 却下（今回の2本を両方捕まえる）
  - 縦の動きが体の60%未満 → 却下
  - シャフトの向きの振れが150度未満 → 却下
  当たれば club も plane も返さない。

撮り直しの案内は数字で:
  手元の1コマ最大移動量が体の4%超なら
  「この撮り方ではクラブは追えません。純正カメラのスローで撮って取り込んで」
  画面には実測値（下にあったコマ数/縦の動き/向きの振れ/手元の速度）を出す。

アプリ内撮影ではクラブ軌跡は取れないと手順書に明記。
骨格・角度・頭のブレは通常撮影でも取れるので撮影機能は残す。

別件: 動画1本で骨格が0コマ（withPose 0）。クラブ以前の問題なので別途。

tests 491件パス（新規6件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uugp7HXc17XWUs1va9eCy3
"@

git push origin main

Write-Host ""
Write-Host "push 完了。READY になったら、同じ動画で【解析し直す】を押してください。" -ForegroundColor Green
Write-Host "クラブ軌跡は出なくなり、代わりに『なぜ出ないか』が数字つきで出ます。" -ForegroundColor Cyan
Write-Host "取りたい場合は iPhone純正カメラの【スロー】で撮って、カルテの動画取り込みから入れてください。" -ForegroundColor Yellow
