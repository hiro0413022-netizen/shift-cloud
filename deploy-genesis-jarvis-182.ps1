# ============================================================
# #182 Genesis ホームを会話型AI（JARVIS）にする
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-genesis-jarvis-182.ps1
#
# ※ 先に Supabase で migration 0133 を流してください
# ※ Vercel(genesis) の環境変数に GEMINI_API_KEY（または OPENAI_API_KEY）を入れると
#    高品質な声になります。未設定でもブラウザ内蔵の音声で喋ります。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0133_genesis_jarvis.sql" `
  "apps/genesis/src/lib/jarvis.ts" `
  "apps/genesis/src/lib/jarvis-pure.ts" `
  "apps/genesis/src/components/jarvis.tsx" `
  "apps/genesis/src/components/sidebar.tsx" `
  "apps/genesis/src/app/api/jarvis/speak/route.ts" `
  "apps/genesis/src/app/(main)/jarvis-actions.ts" `
  "apps/genesis/src/app/(main)/page.tsx" `
  "apps/genesis/src/app/(main)/dev-requests/page.tsx" `
  "apps/genesis/src/app/(main)/dev-requests/actions.ts" `
  "apps/genesis/src/app/globals.css" `
  "tests/jarvis.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "genesis: ホームを話しかけて動く画面にした (#182)" -m @"
ホームは「見る画面」だったので、見に行かないと何も起きなかった。開いた瞬間に喋る面にする。

- 最初の一言はLLMを使わない（openingLine）
  ホームは1日に何度も開く。毎回LLMを叩けば課金が積み上がり、APIが落ちた日は
  無言の箱になる。喋る数字は画面が計算し終えた値をそのまま使うので画面とずれない。

- 数字はJARVISに書かせない
  ブリーフィングに無い数字は Ask Data(#56) に丸投げ。LLMが書くのはSQLだけで
  計算はPostgres。生成SQLと件数は出典として会話の中に出す。

- 案内先は NAV_MAP で検証する
  存在しない画面のボタンを出すのがいちばん信用を失う。

- 声は業者を増やさない（#179と同じ）
  OPENAI_API_KEY があれば gpt-4o-mini-tts、無ければ既存の GEMINI_API_KEY で
  Gemini TTS（生PCMにWAVヘッダを付ける）、どちらも無ければブラウザ内蔵音声。
  どの状態でも無音にならない。

- 開発依頼を受け取る口（gn_dev_requests）
  git push はユーザーのPCからしか実行できない（2026-08-17）＝それが最後の安全弁。
  よって実装を起こす権限は全部渡し、本番に出す権限だけ人に残す。
  会話で出た依頼はAIが指示書に起こしてキューへ積み、Cowork側のClaudeが拾う。
  言われた原文(said)はAIの要約で上書きしない。

- 承認ラインは崩さない（VISION §7）
  外部送信・課金・本番デプロイ・契約はJARVISは実行しない。
  スコア・判断フィード・KPI・ティッカーは下にそのまま残した。

migration 0133 / tests 477件パス（新規15件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uugp7HXc17XWUs1va9eCy3
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel のデプロイが終わったら Genesis のホームを開いてください。" -ForegroundColor Green
Write-Host "開いた瞬間に喋ります。マイクボタンで話しかけられます（Chrome / Edge）。" -ForegroundColor Cyan
Write-Host "声を良くするには Vercel(genesis) に GEMINI_API_KEY を追加してください。" -ForegroundColor Yellow
