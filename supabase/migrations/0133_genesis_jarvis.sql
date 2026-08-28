-- ============================================================
-- 0133: ホームを「話しかけて動かす」対話AI（JARVIS）にする
--
-- 背景（2026-08-28 ユーザー依頼）:
--   「ジェネシスのホームのところで、アイアンマンのジャービスのような
--     会話型のAIにしていきたい」
--
--   これまでのホームは スコア＋判断フィード＋KPI＋ティッカー の「見る画面」だった。
--   見る画面は、見に行かないと何も起きない。話しかけて動く面にする。
--
-- ここで作るのは2つだけ:
--   1. gn_jarvis_turns   … 会話ログ（何を聞かれ、どう判定し、何をしたか）
--   2. gn_dev_requests   … 会話から出た「開発してほしい」を受け取るキュー
--
-- なぜ開発依頼を「キュー」にするか（重要な設計判断）:
--   ユーザーの要望は「JARVISに開発までやらせたい・完全権限を与えたい」。
--   ただし本番へ出す最後の一歩（git push）は 2026-08-17 の決定で
--   **ユーザーのPCからしか実行できない**（サンドボックスからGitHubへ push できない）。
--   これは制約であると同時に、そのまま最後の安全弁になっている。
--   よって JARVIS には「実装を起こす権限」を全部渡し、
--   「本番に出す権限」だけを人の手に残す ＝ 依頼はDBに積み、
--   Cowork側のClaude（このリポジトリを触れる側）が拾って実装する形にする。
--   Genesis と Cowork は同じ Supabase を見ているので、この表が両者の受け渡し口になる。
--
-- 追加のみ（DECISIONS #2）。既存テーブルは触らない。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 会話ログ
--    Ask Data（gn_chat_messages）は「質問→SQL→答え」専用なので、
--    雑談・画面誘導・開発依頼まで混ぜると意味が濁る。JARVISは別表に持つ。
-- ------------------------------------------------------------
create table if not exists gn_jarvis_turns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  said text not null,                    -- 人が言ったこと（音声入力もここに入る）
  intent text not null default 'talk'
    check (intent in ('brief', 'data', 'navigate', 'dev', 'talk', 'error')),
  reply text,                            -- JARVISが返した（＝読み上げた）文
  action jsonb,                          -- 画面誘導・開発依頼などの付随結果
  generated_sql text,                    -- intent='data' のとき Ask Data が実行したSQL
  row_count int,
  input_mode text not null default 'text' check (input_mode in ('text', 'voice')),
  elapsed_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_gn_jarvis_turns_company on gn_jarvis_turns (company_id, created_at desc);
create index if not exists idx_gn_jarvis_turns_staff on gn_jarvis_turns (staff_id, created_at desc);
comment on table gn_jarvis_turns is 'ホームの対話AI(JARVIS)の全発話ログ。意図判定の結果と実行した内容を残す';

alter table gn_jarvis_turns enable row level security;
drop policy if exists tenant_select on gn_jarvis_turns;
create policy tenant_select on gn_jarvis_turns for select to authenticated
  using (company_id = app.current_company_id());

-- ------------------------------------------------------------
-- 2. 開発依頼キュー
--    「◯◯を直して」と話しかけたら、AIが正式な開発指示書に起こしてここへ積む。
--    Cowork側のClaudeは queued を拾い、着手時に in_progress、
--    実装が終わったら done + result_note（何をどう直したか・pushコマンド）を書き戻す。
-- ------------------------------------------------------------
create table if not exists gn_dev_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  requested_by uuid references staff(id),
  source text not null default 'jarvis'
    check (source in ('jarvis', 'command', 'suggestion', 'incident', 'manual')),
  title text not null,                   -- 一行で何をしたいか
  said text,                             -- 元の言葉（丸めない。ここが一次資料）
  spec text not null,                    -- AIが起こした開発指示書（背景/目的/対象/注意/完了条件）
  app_hint text,                         -- 触りそうなアプリ（genesis / member-os / lesson-os ...）
  priority text not null default 'normal' check (priority in ('urgent', 'normal', 'low')),
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'done', 'rejected', 'blocked')),
  picked_at timestamptz,                 -- Cowork側が着手した時刻
  done_at timestamptz,
  result_note text,                      -- 実装結果・DECISIONS番号・pushコマンドなど
  commit_sha text,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gn_dev_requests_queue on gn_dev_requests (company_id, status, created_at);
comment on table gn_dev_requests is 'JARVISが受け取った開発依頼のキュー。Cowork側のClaudeがqueuedを拾って実装し、結果を書き戻す';
comment on column gn_dev_requests.said is '人が実際に言った言葉。AIの要約で上書きしない（一次資料）';
comment on column gn_dev_requests.spec is 'AIが起こした開発指示書。Cowork側はこれを読んで着手する';

alter table gn_dev_requests enable row level security;
drop policy if exists tenant_select on gn_dev_requests;
create policy tenant_select on gn_dev_requests for select to authenticated
  using (company_id = app.current_company_id());

-- updated_at を触ったときに自動で進める（既存の共通トリガ関数があればそれを使う）
create or replace function gn_dev_requests_touch() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_gn_dev_requests_touch on gn_dev_requests;
create trigger trg_gn_dev_requests_touch before update on gn_dev_requests
  for each row execute function gn_dev_requests_touch();
