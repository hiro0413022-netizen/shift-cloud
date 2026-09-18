-- 0194: 組立データ（組み上がりの実測）とお礼状（2026-09-19 ユーザー要望）
--   ・組立後に組立データを記入する。グリップ交換などは不要なので、残す／残さないは手で切り替える（assembly_record）
--   ・組立データ記入後に A4 のお礼状（クラブデータつき）を印刷する（thanks_note は添える一言）
alter table public.gw_work_orders add column if not exists assembly_record boolean;
comment on column public.gw_work_orders.assembly_record is '組立データを残すか（null=自動：シャフトの明細があれば残す／true=残す／false=残さない。グリップ交換だけ等）';
alter table public.gw_work_orders add column if not exists thanks_note text;
comment on column public.gw_work_orders.thanks_note is 'お礼状に添える一言（空なら定型文のみ）';
alter table public.gw_work_order_specs add column if not exists actual_loft numeric;
alter table public.gw_work_order_specs add column if not exists actual_lie numeric;
alter table public.gw_work_order_specs add column if not exists grip_name text;
comment on column public.gw_work_order_specs.actual_loft is '組み上がりのロフト角（度）';
comment on column public.gw_work_order_specs.actual_lie is '組み上がりのライ角（度）';
comment on column public.gw_work_order_specs.grip_name is '装着したグリップ（モデル・サイズ）';
