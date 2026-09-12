-- 0159_pgw_contact_methods.sql
-- PRO SITE: お問い合わせを「システムがメールを送る」から「連絡先を押すとお客様のアプリが開く」方式へ（#236）。
-- 理由（ユーザー判断 2026-09-12）: 外部のメール送信サービス（Resend）の無料枠は全社共通で、
--   プロへのお問い合わせが増えるほど FRANK の予約確認・入会完了メールの枠を食う。
--   お問い合わせは間に人もシステムも要らない＝お客様のメールアプリ／LINE／電話から本人へ直接送ってもらう。
-- 画面に出る窓口は、プロが管理画面で入れたものだけ（空欄の窓口は出さない）。
alter table pgw_pros add column if not exists contact_line_url text;  -- LINE友だち追加URL（https://lin.ee/... / https://line.me/...）
alter table pgw_pros add column if not exists contact_phone text;     -- 公開する電話番号（タップで発信）
alter table pgw_pros add column if not exists contact_note text;      -- 返信の目安など、窓口の上に出す一言
-- InstagramのDMを窓口に出すか（IDが登録済みでも、本人が選ぶまで出さない）
alter table pgw_pros add column if not exists contact_ig_dm boolean not null default false;
