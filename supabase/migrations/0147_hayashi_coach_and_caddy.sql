-- #211 (2026-09-03) 林 和希をコーチに変更し、シフトで「キャディ」を選べるようにした（適用済）
--
-- ユーザー指示:「林君はコーチになりましたので変更お願いします。
--                またシフトを組むときに林君がキャディーの選択ができるようにしてください」
--
-- ★ コードは変えていない。どちらも「人ごとの設定」で決まる作りになっているため。
--   - 会員ページに出す肩書き  = staff.member_page_role（#209 のオプトイン欄）
--   - シフトで選べる業務      = staff_schedule_types（#147 の本人ごとの許可リスト）
--   同じことは画面からもできる（/admin/staff → 本人 → 「シフトで選べる業務」）。

-- (1) 会員ページの出勤予定での肩書き
update public.staff
   set member_page_role = 'コーチ', updated_at = now()
 where name = '林 和希' and deleted_at is null;

-- (2) シフトの業務プルダウンに「キャディ」を出す
insert into public.staff_schedule_types (company_id, staff_id, schedule_type_id)
select s.company_id, s.id, t.id
  from public.staff s
  join public.schedule_types t
    on t.company_id = s.company_id and t.name = 'キャディ'
 where s.name = '林 和希' and s.deleted_at is null
on conflict (staff_id, schedule_type_id) do update set deleted_at = null;
