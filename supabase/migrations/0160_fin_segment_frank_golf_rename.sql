-- 0160_fin_segment_frank_golf_rename.sql
-- 事業名の修正: 「姫路インドアゴルフ」→「FRANK GOLF（姫路）」
--
-- ■ 経緯
--   0022_money_os.sql の seed に仮称「姫路インドアゴルフ」で入っていた。
--   実体は FRANK GOLF 姫路（stores.code='frunk_himeji' / stores.name='FRANK GOLF 姫路'、0067で改名済）。
--   GENESIS トップの「事業別パフォーマンス」は fin_segments.name をそのまま表示するため、
--   旧仮称のまま出ていた。
--
-- ■ 変更しないもの（意図的）
--   fin_segments.code = 'himeji' … 識別子。apps/genesis kernel.ts の storesForSegment('himeji')、
--                                   0022 の hq 参照などが code で引いているため据え置き。
--   reports / ai_suggestions の過去本文に残る旧名 … 当時の記録なので書き換えない。

update fin_segments
   set name = 'FRANK GOLF（姫路）',
       updated_at = now()
 where code = 'himeji'
   and name = '姫路インドアゴルフ'
   and deleted_at is null;

-- 確認用（適用後に手動で実行）
-- select code, name from fin_segments where deleted_at is null order by sort_order;
