-- ============================================================
-- 0130: クラブヘッド軌跡・スイングプレーン・実測fps
--
-- 背景（2026-08-28 ユーザー依頼の続き）:
--   「体より先にクラブヘッドの動きをとらえて線を出したり、スイングプレーンを自動計測したい」
--
--   0129 の骨格（特に両手首）を足場にして、フレーム間差分から
--   シャフトの向き＝ヘッド位置を推定する。1動画1行のまま列だけ足す。
--
-- なぜ別テーブルにしないか:
--   骨格と必ず同時に作られ、同時に読まれ、同時に捨てられる（解析し直し＝両方作り直す）。
--   行を分ける理由が無い。
--
-- club の形:
--   { "v":1, "t":[ms...], "p":[[x,y,conf], ...], "clubLen":123 }
--   x,y は動画の幅・高さで正規化して1000倍した整数。conf は 0〜100。
--   検出できなかったコマは []。clubLen は推定クラブ長（画面幅を1000としたときの長さ）。
--
-- plane の形:
--   { "x1":.., "y1":.., "x2":.., "y2":.., "_method":"address"|"manual" }
--   0〜1の正規化座標。address＝アドレスの手とテークバック初期のヘッドから自動で引いた線。
--   manual＝コーチが線ツールで引き直したもの（自動が外れたときの逃げ道。手動が常に優先）。
--
-- ⚠ 単眼カメラなので、ここで出る角度はすべて「画面に映った見た目の角度」。
--    三脚の位置が変われば数字も変わる。絶対値ではなく同じ生徒の前回との差で読む。
-- ============================================================

alter table lsn_video_pose
  add column if not exists club  jsonb,
  add column if not exists plane jsonb,
  add column if not exists src_fps numeric(6, 2);

comment on column lsn_video_pose.club    is 'クラブヘッド軌跡 {v,t[],p[[x,y,conf]],clubLen}。x,yは1000倍の整数・confは0〜100。検出できないコマは空配列';
comment on column lsn_video_pose.plane   is 'スイングプレーンの基準線 {x1,y1,x2,y2,_method:"address"|"manual"}。0〜1の正規化座標';
comment on column lsn_video_pose.src_fps is '動画の実測フレームレート（requestVideoFrameCallbackで計測）。取れなければ null';
