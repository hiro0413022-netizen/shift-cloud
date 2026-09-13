-- 0150_reception_returning_guest.sql
-- 店頭タブレットの受付フォームに「2回目以降の方」の入口を作る。
--
-- なぜ必要か（ユーザー指摘 2026-09-06）:
--   受付タブレットは来るたびに氏名・カナ・生年月日・住所・電話・メールを全部書かせていた。
--   常連の方に毎回それをお願いするのは申し訳ないし、書き直すたびに表記がぶれて
--   受付台帳(mbr_guests)に同じ人が何人も増える（#190で名寄せを直した根っこと同じ問題）。
--
-- 決定（ユーザー 2026-09-06）:
--   ・お名前で引く。候補を選べばそれで確定（電話下4桁などの本人確認は挟まない＝ユーザー選択）
--   ・引く先は受付台帳のお客様(mbr_guests)だけ。会員名簿・FRANKは店頭のお客様画面に出さない
--   ・アンケートは今日の利用区分に合わせて毎回いただく（体験なら体験、フィッティングならフィッティング）
--
-- 個人情報の扱い（ここが肝）:
--   候補として返すのは **氏名・カナ・電話の下4桁・前回来店日・来店回数だけ**。
--   住所・生年月日・メール・電話全桁は返さない。お客様のタブレットは誰でも触れるので、
--   名前を打っただけで他人の住所が読める画面を作らない。前回の内容はサーバー側で
--   guest_id から引いて台帳につなぐので、画面に出す必要がそもそも無い。

-- ============================================================
-- 1. app.kana — 検索用の正規化（ひらがな→カタカナ・空白と中黒を落とす）
--    「山田 太郎」と「山田太郎」、「やまだ」と「ヤマダ」を同じものとして扱う。
--    ※ 電話の正規化 app.digits(0110) と同じ役割の、氏名版。
-- ============================================================
create or replace function app.kana(t text) returns text
language sql immutable
as $$
  select nullif(
    translate(
      replace(replace(replace(replace(coalesce(t, ''), ' ', ''), '　', ''), '・', ''), '.', ''),
      'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ',
      'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴ'
    ), '')
$$;

comment on function app.kana(text) is
  '氏名検索の正規化。ひらがな→カタカナ、空白・中黒・ドットを除去する。app.digits の氏名版。';

-- ============================================================
-- 2. search_reception_guests — 店頭タブレットの「2回目以降の方」の検索
--
--   ・お名前（漢字）／フリガナ／ひらがな のどれでも引ける
--   ・2文字未満では引かない（1文字で名簿が並ぶのを防ぐ）
--   ・返すのは表示に要る最小限だけ（下4桁マスク・前回来店日・来店回数）
--   ・店舗: この受付URLの店舗に関係する方だけ。ただし店舗が入っていない
--     古い行は落とさない（Excel移行分は store_id が空のことがある）
-- ============================================================
create or replace function search_reception_guests(
  p_company_id uuid,
  p_store_id uuid default null,
  p_q text default null,
  p_limit int default 8
) returns jsonb
language sql
security definer
set search_path = public
as $$
  with k as (
    select app.kana(p_q) as q
  ),
  hit as (
    select g.id, g.name, g.name_kana,
           right(coalesce(app.digits(coalesce(nullif(g.mobile, ''), g.phone)), ''), 4) as phone_tail
    from mbr_guests g, k
    where g.company_id = p_company_id
      and g.deleted_at is null
      and k.q is not null
      and length(k.q) >= 2
      and (
            app.kana(g.name)      like '%' || k.q || '%'
         or app.kana(g.name_kana) like '%' || k.q || '%'
      )
      and (
            p_store_id is null
         or g.store_id is null
         or g.store_id = p_store_id
         or exists (
              select 1 from mbr_walkin_visits v
              where v.guest_id = g.id and v.deleted_at is null
                and (v.store_id = p_store_id or v.store_id is null)
            )
      )
    limit greatest(coalesce(p_limit, 8), 1) * 8   -- 集計前の取り過ぎ防止
  ),
  agg as (
    select h.id, h.name, h.name_kana, h.phone_tail,
           count(v.id)::int   as visit_count,
           max(v.visited_on)  as last_visit
    from hit h
    left join mbr_walkin_visits v
      on v.guest_id = h.id and v.deleted_at is null
    group by h.id, h.name, h.name_kana, h.phone_tail
    order by max(v.visited_on) desc nulls last, count(v.id) desc
    limit greatest(coalesce(p_limit, 8), 1)
  )
  select coalesce(
           jsonb_agg(to_jsonb(agg) order by agg.last_visit desc nulls last, agg.visit_count desc),
           '[]'::jsonb
         )
  from agg
$$;

comment on function search_reception_guests(uuid, uuid, text, int) is
  '店頭タブレット「2回目以降の方」の氏名検索。氏名・カナ・電話下4桁・前回来店日・来店回数のみ返す（住所や生年月日は返さない）。';

grant execute on function app.kana(text) to service_role;
grant execute on function search_reception_guests(uuid, uuid, text, int) to service_role;
