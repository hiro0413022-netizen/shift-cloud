-- 0217: 意味検索の埋め込み表を「取り込みが止まらない」形に（#311）
--   実測（2026-09-29）: HNSW 索引への挿入が 1 本 約185ms（50 行の insert で 10 秒）→ PostgREST の 8 秒に当たり取り込みの半分が 0 本。
--   さらに embedding 列が TOAST（extended）で、索引なしの全走査が 2 万行で 7 秒。
--   対策: (1) embedding を PLAIN 格納（行内・3KB）にして全走査を速く（2 万行 0.36 秒）、(2) HNSW 索引を落として挿入を軽く。
--   4 万行の規模では正確検索（全走査）で十分。10 万行を超えたら HNSW を再作成する（DECISIONS #311）。
--   適用後に手で実行したもの（トランザクション外）:
--     update gn_embeddings set embedding = (embedding::text)::vector;  -- 既存行を行内へ書き直す（同じ値の update では TOAST ポインタが使い回されるので cast で新しい datum にする）
--     vacuum full analyze gn_embeddings;
alter table gn_embeddings alter column embedding set storage plain;
drop index if exists idx_gn_embeddings_hnsw;
