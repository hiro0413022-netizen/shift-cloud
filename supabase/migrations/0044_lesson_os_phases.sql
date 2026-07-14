-- 0044 Lesson OS: スイングフェーズ（アドレス〜フィニッシュ）と撮影メタ
-- DECISIONS #51
-- phases 例: {"address":0.42,"takeback":1.10,"top":1.62,"downswing":1.75,
--             "impact":1.95,"follow":2.12,"finish":2.70,
--             "_method":"audio","_at":"2026-07-13T05:00:00Z"}
-- 値は動画先頭からの秒数（float）。_method は audio|ratio|manual。

alter table public.lsn_videos
  add column if not exists phases jsonb not null default '{}'::jsonb,
  add column if not exists duration_sec numeric(6, 2),
  add column if not exists source text;   -- 'recorder' | 'upload'

alter table public.lsn_model_videos
  add column if not exists phases jsonb not null default '{}'::jsonb,
  add column if not exists duration_sec numeric(6, 2);

comment on column public.lsn_videos.phases is 'スイングフェーズの秒数（address/takeback/top/downswing/impact/follow/finish）＋_method';
comment on column public.lsn_videos.source is '撮影経路: recorder=アプリ内カメラ / upload=ファイル選択';
