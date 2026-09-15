-- ============================================================
-- 0183: LINEに名前を出さないスタッフ（DECISIONS #243）
--
-- 背景（2026-09-15 ユーザー指示）: 「藤田プロの名前はLINEに一切出さない」。
--   朝の出勤連絡・スタッフへ連絡・JARVIS経由の送信など、公式LINEへ出る文面から
--   その人の名前を消す。画面（店舗ダッシュボード・スタッフアプリ・紙シフト）は対象外。
--
-- 設計: 名前をコードに書かず staff.line_hidden で持つ。
--   - 朝連絡の「本日の出勤」からは行ごと外す（apps/genesis ceo-ai.ts）
--   - それ以外の文面は送信直前に @yozan/core/line-redact で語を「担当プロ」に置き換える
--     （apps/genesis lib/line.ts の linePush / lineBroadcast が必ず通す）
-- 追加のみ。既定 false なので他のスタッフは何も変わらない。
-- ============================================================
alter table staff add column if not exists line_hidden boolean not null default false;
comment on column staff.line_hidden is '公式LINEに出る文面から名前を消す（#243）。画面には出る';

-- 藤田プロ（company YOZAN）
update staff set line_hidden = true
 where id = 'bb276810-2603-41f1-b464-371f827a271e'
   and company_id = 'ec00ad2a-4032-4061-bdb7-03face8a04e7';
