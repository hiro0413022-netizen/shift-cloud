-- ============================================================
-- 0129: スイング動画のボーン（骨格）データ
--
-- 背景（2026-08-28 ユーザー依頼）:
--   「体の動きを把握するためにボーンデータを出したい」
--
--   撮影済みの動画をブラウザ上で1コマずつ MediaPipe Pose Landmarker に通し、
--   33関節の座標を取り出して動画に重ねる。クラブヘッド軌跡／スイングプレーンの
--   自動計測は、この骨格（特に両手首）を足場にして次段で載せる。
--
-- なぜ lsn_videos の列ではなく別テーブルか:
--   1本あたり 8秒×30fps で 240フレーム × 33関節 ＝ 数百KB になる。
--   カルテは1人20本超を一覧で引くので、同じ行に置くと一覧が重くなる。
--   プレーヤーを開いたときだけ video_id で1行取りに行く。
--
-- data の形（v1・すべて整数に丸めて軽くする）:
--   {
--     "v": 1,
--     "t": [0, 33, 66, ...],            // 各フレームの時刻（ミリ秒）
--     "p": [[x0,y0,z0, x1,y1,z1, ...], ...]  // 33関節×3 を ×1000 した整数
--   }                                    // 検出できなかったフレームは []
--   x,y は動画の幅・高さで正規化（0〜1000）。z は腰中心からの相対で符号あり。
--   ※ 単眼カメラなので z は目安。角度計算は基本 x,y の2Dで行う。
-- ============================================================

create table if not exists lsn_video_pose (
  video_id   uuid primary key references lsn_videos(id) on delete cascade,
  company_id uuid not null references companies(id),
  engine     text not null,                   -- 例: 'mediapipe/pose_landmarker_lite@1.0.1'
  fps        numeric(5, 2),                   -- 解析に使った実効フレームレート
  width      int,
  height     int,
  frames     int not null default 0,          -- 解析したコマ数
  detected   int not null default 0,          -- そのうち人を検出できたコマ数
  data       jsonb not null,
  analyzed_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table  lsn_video_pose         is 'スイング動画の骨格データ（ブラウザで解析した結果）。1動画1行・作り直しは上書き';
comment on column lsn_video_pose.data    is '{v,t[],p[][]} — t=ミリ秒, p=33関節×(x,y,z)を1000倍した整数。未検出フレームは空配列';
comment on column lsn_video_pose.detected is '検出できたコマ数。frames に対して極端に少ないなら撮影条件が悪い（逆光・全身が入っていない等）';

create index if not exists idx_lsn_video_pose_company on lsn_video_pose (company_id);

-- RLS（テナント標準・0041 と同じ形）
alter table lsn_video_pose enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'lsn_video_pose' and policyname = 'tenant_select') then
    execute 'create policy tenant_select on lsn_video_pose for select to authenticated using (company_id = app.current_company_id())';
    execute 'create policy tenant_insert on lsn_video_pose for insert to authenticated with check (company_id = app.current_company_id())';
    execute 'create policy tenant_update on lsn_video_pose for update to authenticated using (company_id = app.current_company_id())';
  end if;
end $$;
