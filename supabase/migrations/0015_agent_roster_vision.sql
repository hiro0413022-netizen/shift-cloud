-- 0-c: VISION §4の15役割をai_agentsに反映 — 欠落2体（顧客AI/投資・新規事業AI）を追加、ブランドAIの役割を明確化
-- 適用済: 2026-07-06 MCP経由（本番qrgpblnnhdudigarrtuz、適用後21体）
insert into ai_agents (company_id, code, name, role, description, permissions)
select c.company_id, v.code, v.name, v.role, v.description, v.permissions::jsonb
from (select company_id from ai_agents where code = 'ceo_ai' limit 1) c
cross join (values
  ('customer_ai', '顧客AI', '会員管理・退会リスク・満足度',
   'VISION §4: 会員データを見て退会リスクを早期検知し、フォロー策を提案する',
   '{"watch":["会員数","退会率","利用頻度","満足度・顧客の声"],"judge":["退会リスクの検知","フォロー要否と優先度"],"execute":["退会防止アプローチ案","満足度調査・フォロー文面の下書き（顧客への連絡は要承認）"]}'),
  ('invest_ai', '投資・新規事業AI', '事業案・収支・出店判断',
   'VISION §4: 新規事業・出店の判断材料を数字で作る',
   '{"watch":["新店候補・市場情報","既存店収支","投資回収状況"],"judge":["投資対効果","出店・撤退の判断材料"],"execute":["事業案・収支シミュレーション・出店判断資料の作成（投資実行・契約は要承認）"]}')
) as v(code, name, role, description, permissions)
where not exists (
  select 1 from ai_agents a where a.company_id = c.company_id and a.code = v.code
);

update ai_agents
set role = 'KALLINOSブランド統括 — 世界観・商品企画・EC運営'
where code = 'kallinos_ai';
