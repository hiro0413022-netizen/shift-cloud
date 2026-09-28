-- 0211: Proactive ルールの Act（#294・P3-a）
--   Detect → Explain → Recommend → **Act** の最後を埋める。
--   gn_rules.action_tool（0210 で用意済み）に Tool を入れ、action_input に引数を持つ。
--   発火時に cron が Core（executeTool）を通して実行する。起点が人でない＝AI Actor なので、
--   risk>=2 の Tool（message.send など）は Policy で承認待ちになり、判断フィードに承認カードとして出る＝勝手に送らない。
--   追加のみ・既存表の列は変えない。

alter table gn_rules add column if not exists action_input jsonb not null default '{}'::jsonb;
comment on column gn_rules.action_tool is 'Genesis: 発火時に Core で実行する Tool（例 message.send@1）。risk>=2 は承認待ちになる #294';
comment on column gn_rules.action_input is 'Genesis: action_tool の引数。文字列の {count} {date} {title} は発火時に埋まる #294';

-- 初期の Act 2本（どちらもスタッフLINE＝承認してから送る）
update gn_rules set
  action_tool = 'message.send@1',
  action_input = jsonb_build_object('body', '【Genesis】明日の予約 {count} 件に対してシフトが入っていません。体制の確認をお願いします。', 'audience', 'staff'),
  updated_at = now()
where code = 'bookings_tomorrow_no_shift';

update gn_rules set
  action_tool = 'message.send@1',
  action_input = jsonb_build_object('body', '【Genesis】24時間以上返信のない問い合わせが {count} 件あります。Genesis の問い合わせ画面から返信をお願いします。', 'audience', 'staff'),
  updated_at = now()
where code = 'inquiries_unreplied_24h';
