-- FRANK ドリンク価格を一律にする（#167・ユーザー確定）
--
-- 決めた値は **税込＝お客様が実際に払う額**:
--   ソフトドリンク  会員 330円 / ビジター 660円
--   ノンアルコール  会員 440円 / ビジター 880円
--
-- price_* は税抜の本体価格（#166）なので、110で割った値を入れる。
--   330 / 1.1 = 300   660 / 1.1 = 600
--   440 / 1.1 = 400   880 / 1.1 = 800
-- 4つとも割り切れるので、端数が出ない＝表示も請求もぴったりこの額になる。
--
-- ソフトドリンク＝ DRINK と FRANK SPECIAL（ソーダ4品）。
-- ノンアルコール＝ NON-ALCOHOL の3品。

-- 取り扱いをやめる2品（ユーザー指定）。
-- ⚠ 行は消さない。過去の伝票（frunk_order_items.menu_item_id）の紐付けが切れるため。
--    active=false でメニューから外すのが、この台帳での「削除」。
update public.frunk_menu_items
   set active = false, updated_at = now()
 where deleted_at is null
   and name in ('プロテインドリンク', 'ノンアルモヒート');

-- ソフトドリンク: 税込 330 / 660
update public.frunk_menu_items
   set price_member = 300, price_general = 600, updated_at = now()
 where deleted_at is null
   and active
   and category in ('DRINK', 'FRANK SPECIAL');

-- ノンアルコール: 税込 440 / 880
update public.frunk_menu_items
   set price_member = 400, price_general = 800, updated_at = now()
 where deleted_at is null
   and active
   and category = 'NON-ALCOHOL';

-- レッドブルだけノンアルコールと同じ価格帯にする（#167b・ユーザー指定）。
-- 仕入原価が他のソフトドリンクより高く、一律330円だとこの1品だけ利益率が落ちるため。
-- 税込 会員440 / ビジター880（ビジターは会員の2倍＝#167で決めた並び）。
update public.frunk_menu_items
   set price_member = 400, price_general = 800, updated_at = now()
 where deleted_at is null and name = 'レッドブル';
