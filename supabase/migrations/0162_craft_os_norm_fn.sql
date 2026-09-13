-- 適用済み: 2026-09-12（Supabase migration名 craft_os_norm_fn / craft_os_norm_fn_fix_star）
-- 試打NOと商品マスタの名寄せに使う正規化関数。
--
-- ★ ☆★ は消さないこと。TRPX RED HOT のフレックス表記（☆／☆☆／☆☆☆）で、
--   消すと3本が1本に潰れて「候補が複数」になる（実際に一度そうなった）。
-- ★ 日本語は残す（「秩父」などの製品名があるため）。

create or replace function golfwing.norm_name(p text)
returns text language sql immutable as $fn$
  select upper(
    regexp_replace(
      regexp_replace(
        translate(
          coalesce(p,''),
          '　ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９－＋（）［］',
          ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-+()[]'
        ),
        '[(\[][^()\[\]]*[)\]]', '', 'g'          -- 括弧書きの注記（廃盤・在庫限り・色確認 等）を除去
      ),
      '[\s\-_/,.''"`·・]', '', 'g'               -- 空白・記号を除去
    )
  );
$fn$;

create or replace function golfwing.norm_maker(p text)
returns text language sql immutable as $fn$
  select upper(regexp_replace(translate(coalesce(p,''),'　',' '), '\s', '', 'g'));
$fn$;

grant execute on function golfwing.norm_name(text)  to authenticated, service_role;
grant execute on function golfwing.norm_maker(text) to authenticated, service_role;

create index if not exists products_norm_name_idx
  on golfwing.products (golfwing.norm_name(name)) where is_active;
create index if not exists products_norm_name_spec_idx
  on golfwing.products (golfwing.norm_name(name || coalesce(spec,''))) where is_active;
