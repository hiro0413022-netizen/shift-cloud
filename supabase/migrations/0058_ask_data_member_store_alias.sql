-- 0058_ask_data_member_store_alias.sql
-- gnv_members の店舗絞り込み修正（DECISIONS #56 の補修）
--
-- 症状: スタッフ画面（店舗スコープ）で「在籍会員は何名？」が 0 になった。
-- 原因: 会員名簿 mbr_members は店舗IDを持たず store_name はテキスト。
--       現状は全員 'ゴルフウィング' だが、スタッフの所属店舗名は 'GOLF WING 宝塚'。
--       名称完全一致で突き合わせていたため 0 件になっていた（本部スコープは絞らないので233で正常だった）。
-- 対応: store_id を持つまでの暫定エイリアス（'ゴルフウィング' → GOLF WING 宝塚）を入れる。
--       姫路開業で store_name が複数化したら、会員名簿に store_id を持たせて差し替える。
create or replace view gnv_members as
  select m.member_no, m.name as member_name, m.gender, m.age,
         m.join_date, m.leave_date, m.leave_reason, m.member_type, m.class_name,
         m.store_name, m.campaign, m.payment_method, m.monthly_visits, m.last_visit_date,
         (m.leave_date is null) as is_active
  from mbr_members m
  where m.company_id = gn_ctx_company()
    and (
      gn_ctx_store() is null
      or m.store_name = (select name from stores where id = gn_ctx_store())
      or (m.store_name = 'ゴルフウィング'
          and (select name from stores where id = gn_ctx_store()) = 'GOLF WING 宝塚')
    );
comment on view gnv_members is 'Ask Data: 会員。leave_date が null = 在籍中。store_nameテキスト突合（ゴルフウィング→GOLF WING 宝塚の暫定エイリアス）';
