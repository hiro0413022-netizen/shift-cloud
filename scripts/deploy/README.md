# scripts/deploy/

- `history/` — 過去のデプロイ用 ps1・コミットメッセージ・パッチ（2026-07〜09）。参照用。新規は作らない。
- 今後のコミット＆push は、クラウド側が作る `deploy-<番号>.ps1` をルートに1つだけ置き、実行後にここへ移す（#290）。
- ルートに残す道具: `apply-dev-queue.ps1`（開発依頼キュー #183）/ `commit-and-deploy.ps1` / `fix-line-endings.ps1`。
