-- 0090: キャディ振込先を項目別に（0089のbank_info自由記述を置き換え。全35件未入力を確認済み）
alter table cad_partners
  add column if not exists bank_name text,          -- 銀行・信金名（例: 尼崎信用金庫）
  add column if not exists bank_branch text,        -- 支店名（例: 鴻池支店）
  add column if not exists bank_account_type text   -- 普通 / 当座
    check (bank_account_type is null or bank_account_type in ('普通','当座')),
  add column if not exists bank_account_no text,    -- 口座番号
  add column if not exists bank_holder text;        -- 口座名義（カナ）
comment on column cad_partners.bank_name is 'キャディの振込先: 銀行・信金名。支払請求書に印字（任意）';
comment on column cad_partners.bank_branch is 'キャディの振込先: 支店名';
comment on column cad_partners.bank_account_type is 'キャディの振込先: 預金種別（普通/当座）';
comment on column cad_partners.bank_account_no is 'キャディの振込先: 口座番号';
comment on column cad_partners.bank_holder is 'キャディの振込先: 口座名義（カナ）';

-- 0089の自由記述欄は未使用のまま置き換え（入力済み0件を確認のうえ削除）
alter table cad_partners drop column if exists bank_info;
