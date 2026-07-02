# SECURITY

## 認証（確定: DECISIONS #2）

- 基本: メール＋パスワード（Supabase Auth）
- メールを持たないスタッフ: ログインID＋パスワード（内部的に`<loginid>@staff.yozan.internal`形式の擬似メールでAuthに登録。UIはIDのみ見せる）
- 将来: LINEログイン追加可能な設計（auth_user_idとstaffの分離で対応済み）

## 認可

- 第1層: RLSによるテナント分離（`company_id`）— DBレベル強制
- 第2層: ロール権限フラグ（`packages/auth`の`can(actor, permission, scope)`）
- 権限フラグ例: `manage_staff` / `manage_stores` / `create_shifts` / `edit_attendance` / `view_payroll` / `manage_payroll` / `view_hq_dashboard` / `manage_company`

## 給与画面の追加保護

- `view_payroll`権限に加え、**セッション再認証**（パスワード再入力、15分有効）を要求
- 給与データ閲覧も監査ログに記録（読み取りログを残す数少ない対象）

## iPad打刻キオスク

- 端末は`kiosk_devices`に登録し、端末トークンで認証（スタッフの個人セッションを使わない）
- 打刻はスタッフ選択＋タップのみ（MVP）。将来: PIN/QR/顔認証/IP検証を追加可能な構造
- 打刻レコードに`device_id`と打刻元を必ず記録

## その他

- service_roleキーはサーバー環境変数のみ。クライアント露出禁止
- 監査ログは削除・更新不可（insertのみ。RLSでupdate/delete拒否）
- 打刻修正は元レコードを書き換えず修正レコードを積む（改ざん防止）
- Sentryで例外監視（Phase 1でセットアップ、個人情報はscrub）
