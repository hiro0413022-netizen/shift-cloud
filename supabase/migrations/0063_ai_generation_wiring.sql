-- 0063_ai_generation_wiring.sql
-- DECISIONS #63 / 2026-07-16
-- 生成側（各AI）から enqueueAction を呼ぶ配線の「試運転ポリシー」。
-- ユーザー選択: 外部向け送信（スタッフLINE等）は【承認ゲートで試運転】から始める。
--   精度を見てから ai_execution_policies で auto_undo に緩める運用。
-- 併せて CEO AI→AI社員の内部指示 agent_directive を追加（内部・低リスク=auto）。

update ai_execution_policies
set mode = 'approval',
    undo_minutes = 0,
    note = case action_type
      when 'staff_directive' then 'スタッフへの指示配信（#63 試運転=承認ゲート。信頼後にauto_undoへ）'
      when 'line_broadcast'  then '定型LINE一斉配信（#63 試運転=承認ゲート）'
      when 'sns_post'        then 'SNS投稿（#63 試運転=承認ゲート・送信基盤は未接続）'
      else note end,
    updated_at = now()
where action_type in ('staff_directive', 'line_broadcast', 'sns_post');

insert into ai_execution_policies (company_id, action_type, mode, undo_minutes, note)
select id, 'agent_directive', 'auto', 0, 'CEO AI→AI社員への内部指示の配布（内部・低リスク）'
from companies order by created_at limit 1
on conflict (company_id, action_type) do nothing;
