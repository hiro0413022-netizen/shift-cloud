-- 0109: FRANK 入会キャンペーン＋月会費前取り（#131）
-- 入会金5,500円税込（年内=2026/12/31申込分まで無料）・入会月無料・2か月分前取り・6か月継続

alter table frunk_members add column if not exists join_campaign text;
alter table frunk_members add column if not exists min_term_until date;
alter table frunk_members add column if not exists prepay_charged_at timestamptz;
alter table frunk_members add column if not exists prepay_pause_done_at timestamptz;

comment on column frunk_members.join_campaign is
  '入会キャンペーンID（例 opening2026=年内入会金無料+入会月無料+2か月前取り+6か月継続）#131';
comment on column frunk_members.min_term_until is
  'キャンペーン入会の最低継続期限（入会日+6か月）。退会操作時にスタッフへ警告 #131';
comment on column frunk_members.prepay_charged_at is
  '前取り2か月目（翌々月分）のカード課金が完了した時刻。Webhookの二重課金ガード #131';
comment on column frunk_members.prepay_pause_done_at is
  '前取りに合わせてサブスクを1周期スキップ（pause）した時刻。二重pauseガード #131';

-- 入会金: 10,000円税抜 → 5,000円税抜（表示・課金は税込5,500円）
update frunk_plans set joining_fee = 5000, updated_at = now()
where joining_fee = 10000 and deleted_at is null;

-- ライト会員: 月8回 → 月4回（表記の修正）
update frunk_plans set note = replace(note, '月8回', '月4回'), updated_at = now()
where name = 'ライト会員' and note like '%月8回%' and deleted_at is null;
