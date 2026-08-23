-- 0122: 体験フォローの送信記録（AI店長 第1弾・DECISIONS #148）
-- /follow でフォロー文面をメール送信できるようにし、何を・どの経路で送ったかを台帳に残す。
-- 後方互換: nullable の列追加のみ（RELEASE_PROCESS.md §4）。

alter table public.mbr_walkin_visits
  add column if not exists follow_up_channel text,
  add column if not exists follow_up_message text;

comment on column public.mbr_walkin_visits.follow_up_channel is
  'フォローの経路: email=メール送信（システムから） / line=公式LINE等（手動）。null=旧データ';
comment on column public.mbr_walkin_visits.follow_up_message is
  '送信した文面（email のとき）。手動フォローは null（内容は follow_up_note）';
