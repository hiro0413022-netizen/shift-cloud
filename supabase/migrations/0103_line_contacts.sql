-- 0103_line_contacts.sql（DECISIONS #121）
-- 個人LINE連絡先台帳: 公式LINEへ1対1で話しかけてきた人を自動登録し、
-- person_name をひも付ければ「◯◯へ個別push」の宛先になる。
-- 第一号: 小川うらら（役員）。本人からの初回メッセージ受信時に
-- LINE表示名が match_hint のいずれかを含めば自動リンクされる。

create table if not exists gn_line_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  channel_code text not null default 'staff',      -- どのOAの友だちか（gn_line_channels.code）
  line_user_id text,                               -- Uで始まるuserId。初回受信時に自動設定
  display_name text,                               -- LINEプロフィール表示名（受信のたび更新）
  person_name text,                                -- 正式名（例: 小川うらら）。入っていれば宛名指定で個別pushできる
  match_hint text,                                 -- 自動リンク用: 表示名にカンマ区切りのどれかが含まれたらリンク
  note text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_gn_line_contacts_user
  on gn_line_contacts (company_id, line_user_id)
  where line_user_id is not null and deleted_at is null;
comment on table gn_line_contacts is '個人LINE連絡先台帳。1対1受信で自動登録・person_nameを付ければ個別push宛先になる（#121）';

alter table gn_line_contacts enable row level security;
drop policy if exists tenant_select on gn_line_contacts;
create policy tenant_select on gn_line_contacts for select to authenticated
  using (company_id = app.current_company_id());
-- 書き込みポリシーなし = service_role（webhook/executor）専用

-- 期待連絡先: 小川うらら（staffチャネルを持つ会社にのみシード・冪等）
insert into gn_line_contacts (company_id, channel_code, person_name, match_hint, note)
select ch.company_id, 'staff', '小川うらら', '小川,うらら,ウララ,urara,ogawa',
       '役員。YOZAN公式LINEから個別連絡する第一号（#121）'
from gn_line_channels ch
where ch.code = 'staff'
  and not exists (
    select 1 from gn_line_contacts x
    where x.company_id = ch.company_id and x.person_name = '小川うらら' and x.deleted_at is null
  );

-- 個別push（line_push_contact）はユーザー指示で送る用途 = auto（承認二度手間にしない）
insert into ai_execution_policies (company_id, action_type, mode, undo_minutes, note)
select ch.company_id, 'line_push_contact', 'auto', 0, '登録済み個人連絡先への1対1 push（#121）'
from gn_line_channels ch
where ch.code = 'staff'
on conflict (company_id, action_type) do nothing;
