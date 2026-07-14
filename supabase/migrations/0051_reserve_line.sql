-- 0051_reserve_line.sql
-- 予約OSのLINE中心化（DECISIONS #56）。
--
-- 背景: @golfwing.jp のDNS/転送はファイン管理で触れないため、お客様への連絡はメールではなく
--   公式LINEを主導線にする。公開フォームをLIFF（LINE内ブラウザ）で開くと userId が取れるので、
--   受付確認・確定連絡を LINE Push で自動送信できる（送信は n8n 統合ハブ経由 / DECISIONS #29b）。
-- メールは「LINE外からの申込」「記録用」の予備に降格（email は任意項目へ）。

alter table res_requests add column if not exists line_user_id text;        -- LIFFで取得（Uから始まる33文字）
alter table res_requests add column if not exists line_display_name text;   -- LINEの表示名（本人確認の補助）
alter table res_requests add column if not exists line_ack_sent_at timestamptz;     -- 受付確認をLINEで送った
alter table res_requests add column if not exists line_confirm_sent_at timestamptz; -- 確定連絡をLINEで送った
alter table res_requests add column if not exists line_error text;          -- Push失敗の理由（n8nが書き戻す）
-- 確定時にスタッフが添えるひとこと。n8nがLINE本文に差し込むためDBに持つ（メール本文と同じ文面を使う）
alter table res_requests add column if not exists confirm_message text;

-- n8n が5分おきに「まだLINEを送っていない申込」を引くためのインデックス
create index if not exists idx_res_requests_line_pending
  on res_requests (status, line_ack_sent_at)
  where deleted_at is null and line_user_id is not null;

create index if not exists idx_res_requests_line_confirm
  on res_requests (status, line_confirm_sent_at)
  where deleted_at is null and line_user_id is not null;

-- 連絡手段が1つも無い申込を作らせない（LINE か メール のどちらかは必須）
alter table res_requests drop constraint if exists res_requests_contact_check;
alter table res_requests add constraint res_requests_contact_check
  check (line_user_id is not null or email is not null);
