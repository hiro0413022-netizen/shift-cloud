-- ============================================================
-- 0191: LINE のリッチメニュー押下を「今日やること」から外す（DECISIONS #255）
--
-- 背景（2026-09-17 ユーザー）:
--   「genesisのLINEの案内などでリッチメニューを押した人にも返信文の提案をしているがいらない」
--
--   GOLF WING ビジター用のリッチメニュー「お問い合わせ」を押すと
--   「お問い合わせを希望します」という文がお客様のメッセージとして届く（これまで19件）。
--   受信フィルタ（0045）に登録が無かったので、毎回返信案つきで今日やることに出ていた。
--   あわせて、登録済みの「プロの出勤情報」「第10回親睦コンペ」も、
--   フィルタが1日1回しか当たらず、その間は今日やることに出ていた（アプリ側で受信時に当てるよう修正）。
--
-- ここでは: ルールを1件足し、いま開いている該当行を「対応不要（自動除外）」にする。
-- ============================================================

insert into sec_filter_rules (company_id, source, pattern, match_type, label, action, active)
select c.id, 'line', 'お問い合わせを希望します', 'exact', 'リッチメニュー', 'noise', true
from companies c
where exists (
  select 1 from sec_inquiries q
  where q.company_id = c.id and q.source = 'line' and q.snippet = 'お問い合わせを希望します'
)
and not exists (
  select 1 from sec_filter_rules r
  where r.company_id = c.id and r.pattern = 'お問い合わせを希望します' and r.deleted_at is null
);

-- 開いている行に、有効な noise ルールを当てる（exact のみ＝登録済みはすべて exact）
with hit as (
  select q.id, r.id as rule_id
  from sec_inquiries q
  join sec_filter_rules r
    on r.company_id = q.company_id
   and r.active and r.deleted_at is null
   and r.action = 'noise' and r.match_type = 'exact'
   and r.source in ('any', q.source)
   and btrim(q.snippet) = r.pattern
  where q.deleted_at is null
    and q.status in ('new', 'awaiting_approval')
)
update sec_inquiries q
set status = 'dismissed', inquiry_type = 'noise', filtered_by_rule = hit.rule_id, updated_at = now()
from hit
where q.id = hit.id;
