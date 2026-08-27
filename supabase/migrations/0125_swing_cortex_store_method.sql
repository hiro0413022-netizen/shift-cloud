-- 0125_swing_cortex_store_method.sql
-- SWING CORTEX 店オリジナル・メソッド（2026-08-27 ユーザー方針）
--
-- このシステムの核心は「その店のレッスンデータから、その店の言葉遣い・ドリル名のまま
-- 指導メソッドを作る」こと。汎用シード(source='seed')はコメントが無い店の初期表示用
-- フォールバックに格下げし、コメント取込済みの店は AI生成(source='ai')の
-- 店オリジナル・メソッド（settings の「店メソッド生成」）を正とする。
--
-- (1) sc_settings.style … 店の文体プロファイル {vocab, drills, phrases, tone}。
--     AIコメント下書き(draftComment)がこの語彙で書く＝店の言葉尻を維持する。
-- 追加のみ（DECISIONS #2）。

alter table sc_settings add column if not exists style jsonb;

-- 自社（株式会社YOZAN / GOLF WING）: これまで ai-actions.ts にハードコードされていた
-- GOLF WING 語彙を style へ移設（コードは全テナント共通・データ駆動へ）
insert into sc_settings (company_id, plan, note, style)
select c.id, 'pro', '自社運用（全機能）',
 jsonb_build_object(
  'vocab', jsonb_build_array('三角形同調','下半身先行','股関節','重心移動','前傾キープ','正面インパクト','コンパクトなトップ','縦振り'),
  'drills', jsonb_build_array('gooドリル','足踏みドリル','ベタ足ドリル','ショルダーターンドリル','両手クロスドリル','ウェイトシフトドリル'),
  'phrases', jsonb_build_array(),
  'tone', '「〜していこう」「〜しましょう」で生徒に直接語りかける'
 )
from companies c where c.name = '株式会社YOZAN'
on conflict (company_id) do update set style = excluded.style;
