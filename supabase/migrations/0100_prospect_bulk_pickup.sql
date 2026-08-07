-- 0100_prospect_bulk_pickup.sql
-- 営業先の自動ピックアップを「まとめて拾える」形に変える（DECISIONS #116）
--
-- 何が問題だったか: 候補1件ごとに詳細ページを開いて1.2秒待つ作りだったため、
-- 45秒の試し実行では10件が限界だった（名簿には約200件ある）。
-- 一覧ページには屋号・住所・電話・診療科が揃っているので、詳細ページは必須ではない。

alter table prs_sources
  add column if not exists visit_detail boolean not null default false;

comment on column prs_sources.visit_detail is
  '詳細ページを開いて公式サイトURLを探すか。既定false＝一覧の行だけで登録する（1件ごとに待ち時間が要るため、trueにすると1回で拾える件数が10分の1以下になる・#116）';

update prs_sources set max_per_run = 100, updated_at = now() where max_per_run < 100;

comment on column prs_sources.max_per_run is
  '1回の巡回で拾う上限。一覧ページ1枚の取得で済むので大きくてよい（既定100）';
