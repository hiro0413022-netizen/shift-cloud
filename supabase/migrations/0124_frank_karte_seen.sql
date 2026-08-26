-- 0124: レッスンカルテの「新着」表示（DECISIONS #155）
--
-- Lesson OS が機能完成していたのに稼働ゼロだった最大の理由は
-- 「書いても生徒に届かない」ことだった（docs / lesson-os-status）。
-- 会員ポータル（#154）ができたので、カルテが更新されたら会員のホームで気づけるようにする。
--
-- 適用済み: 2026-08-26（本番・MCP）
alter table public.frunk_members
  add column if not exists karte_seen_at timestamptz;

comment on column public.frunk_members.karte_seen_at is
  '会員がレッスンカルテを最後に開いた時刻。これより後に動画/コメントが増えていればポータルに新着バッジを出す（#155）';
