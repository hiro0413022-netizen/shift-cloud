-- ブランド表記の統一: FRUNK GOLF → FRANK GOLF（DECISIONS #66）
-- 公式ホームページ（sites/frank-golf）の制作にあたり、正式表記を「FRANK GOLF」に確定。
--
-- ■ 変更するもの
--   stores.name  'FRUNK GOLF 姫路' → 'FRANK GOLF 姫路'（画面に出る表示名のみ）
--
-- ■ 変更しないもの（意図的）
--   stores.code = 'frunk_himeji'  … アプリ側の識別子（FRUNK_STORE_CODE / HIMEJI_STORE_CODE）と
--                                    一致している必要があるため据え置き。表示には使われない。
--   frunk_members / frunk_plans / frunk_signup_tokens … テーブル名は識別子。改名は影響範囲が広く益が薄い。
--
-- ■ 安全性の確認（適用前に検証済み）
--   1) apps/genesis kernel.ts storesForSegment('himeji') … name.includes("FRANK"|"FRUNK"|"姫路")
--      → 「姫路」が残るため改名後も一致する（かつ本コミットで FRANK も明示対応済み）。
--   2) 0028 の月会費予測関数の除外条件 not ilike '%FRUNK%' は mbr_members.store_name
--      （Smart Hello由来の外部テキスト）に対するもので、stores.name とは別物 → 影響なし。
--      ※ Smart Hello 側の表記が変わらない限り、この除外条件は現状のまま有効。
--   3) 0023_money_store_scope の like '%FRUNK%' は適用済みの一度きりのUPDATE → 再実行されない。

update stores
   set name = 'FRANK GOLF 姫路',
       updated_at = now()
 where code = 'frunk_himeji'
   and name = 'FRUNK GOLF 姫路';

-- 確認用（適用後に手動で実行）
-- select id, name, code from stores where code = 'frunk_himeji';
