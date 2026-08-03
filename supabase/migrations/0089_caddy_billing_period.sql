-- 0089: キャディOS 請求書改善（請求月の上書き / キャディ振込先）
-- ① 研修など「月をまたいで請求する」派遣行に請求月を上書きできる列
alter table cad_dispatches add column if not exists billing_ym text
  check (billing_ym is null or billing_ym ~ '^[0-9]{4}-[0-9]{2}$');
comment on column cad_dispatches.billing_ym is
  '請求月の上書き（YYYY-MM）。研修者など請求が月をまたぐ場合のみ設定。NULL=取引先の締め期間どおり';

-- ② キャディ→YOZAN請求書に表示する振込先（任意・自由記述）
alter table cad_partners add column if not exists bank_info text;
comment on column cad_partners.bank_info is
  '振込先の自由記述（例: ○○銀行 ○○支店 普通 1234567 ﾔﾏﾀﾞﾀﾛｳ）。支払請求書に表示。未設定なら従来どおり非表示';
