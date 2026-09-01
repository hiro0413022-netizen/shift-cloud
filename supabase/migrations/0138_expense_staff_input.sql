-- ============================================================
-- 0138 経費の支出をスタッフが入力できるようにする（#191）
--
-- ユーザー依頼（2026-09-01）「money-osで納品書、経費の支出の分をスタッフに入力してもらいたい」。
--
-- これまで mon_expense に入る経路は「ファイン精算書の移行」と「カード・口座CSVの仕分け」だけで、
-- 店で払った現金・立替・掛けは**どこにも入らないまま**だった（本部が後から拾うしかなかった）。
--
-- 足す列は4つだけ。既存の集計（refresh_money_to_finance）は触らない。
--   entered_by     … 誰が入力したか（スタッフ入力なので必須級。監査と問い合わせ先）
--   doc_no         … 納品書・伝票番号。写真を撮らない運用なので、紙と突き合わせる唯一の手がかり
--   paid_by        … 立替えた人（method='advance' のとき）
--   reimbursed_on  … 立替の精算日。NULL＝まだ返していない（精算待ち一覧の判定）
--
-- ⚠ 二重計上について（SYSTEM.md §4-5 の恒久ルール）
--   PLの経費 = mon_expense（発生） + mon_bank_txn の確定出金（支払）。
--   「掛け（後日振込）」と「立替を振込で精算」は**銀行側からも入ってくる**ので、
--   既存の消込（mon_expense.settled_txn_id）で必ず結ぶこと。
--   「店の現金」で払った分は銀行に出てこないので消込は不要。
-- ============================================================

alter table mon_expense add column if not exists entered_by    text;
alter table mon_expense add column if not exists doc_no        text;
alter table mon_expense add column if not exists paid_by       text;
alter table mon_expense add column if not exists reimbursed_on date;

comment on column mon_expense.entered_by    is '入力した人の氏名スナップショット（スタッフ入力・#191）';
comment on column mon_expense.doc_no        is '納品書・伝票番号。紙と突き合わせるための番号（#191）';
comment on column mon_expense.paid_by       is '立替えた人（method=advance のとき・#191）';
comment on column mon_expense.reimbursed_on is '立替の精算日。NULLなら精算待ち（#191）';

-- 「あとで支払う／精算する」ものを毎回さらうので索引を1本
create index if not exists idx_mon_expense_open_payment
  on mon_expense (company_id, method, spent_on)
  where deleted_at is null and settled_txn_id is null;
