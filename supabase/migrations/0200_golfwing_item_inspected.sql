-- 0200: 発注明細に「検品済み」フラグ（#274・2026-09-24）
--
-- 発端: ユーザー報告「仕入れ・在庫の検品済ボタンを押したら通信エラーになりました」。
--   本番ログ: PostgresError: column poi.inspected does not exist（42703）。
--   ダッシュボードの検品ボタンは D1（SQLite）時代からのコードで poi.inspected を読み書きするが、
--   Supabase 側の golfwing.purchase_order_items にはこの列が移されていなかった。
--   （同型の事故: suppliers 8列・receipt_items 3列。"column does not exist" が出たら列を足す）
--
-- 型は boolean。D1 の 1/0 のまま書くと今度は 42804 で落ちるので、アプリ側も true/false に直してある。

alter table golfwing.purchase_order_items
  add column if not exists inspected boolean not null default false;

comment on column golfwing.purchase_order_items.inspected is
  '検品済みか。ダッシュボードの「検品待ち」から【検品済】を押すと true。納品登録(receipts)とは別で、現物を見たかどうか';

-- 検品待ちの一覧は「入荷があって未検品の明細」を出すので、その形の索引を置く
create index if not exists idx_poi_pending_inspection
  on golfwing.purchase_order_items (purchase_order_id) where inspected = false;
