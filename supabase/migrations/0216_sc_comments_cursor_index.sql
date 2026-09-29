-- 0216: 意味検索の取り込みカーソル用の索引（#310）
--   indexSemantic は (company_id, created_at, id) の組で sc_comments をページ送りする。
--   既存の idx_sc_comments_company (company_id, created_at desc) だと同じ created_at が 1,000 件並ぶ塊（Excel 一括取込）を
--   毎回フィルタで捨てるので、カーソルが進むほど遅くなる。組で索引を張って範囲走査にする。追加のみ。
create index if not exists idx_sc_comments_cursor on sc_comments (company_id, created_at, id);
