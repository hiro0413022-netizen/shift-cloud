-- 0218: 意味検索の HNSW 索引を作り直す（#313）
--   0217 で落とした索引。初回取り込み（YOZAN 28,842 本・2026-09-30 05:20 完了）が終わったので一度だけ作った。
--   実測: 索引なしの全走査は 29,025 行で 1.8〜5 秒（ヒープ 116MB がキャッシュに収まらない）、HNSW ありは 0.38 秒（読むのは 7MB）。
--   作成には数分かかる（MCP からは応答が切れるがサーバ側で完走する）。
--   以後の増分は索引ありで取り込む（indexSemantic の upsert は 10 行ずつ）。
--   大量の取り込みをやり直すときは、先に drop index idx_gn_embeddings_hnsw → 取り込み → この migration を再実行。
create index if not exists idx_gn_embeddings_hnsw on gn_embeddings using hnsw (embedding vector_cosine_ops);
