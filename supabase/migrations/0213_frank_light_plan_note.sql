-- 0213: ライト会員の説明文を運営マニュアル第3版に合わせる（#297・2026-09-28）
--
-- ユーザー指摘: 「ライト会員の平日の10:00から15:00までの表示がない、ライト会員でも土日の予約が取れてしまっている」
-- 予約システム側の判定は @yozan/core/frank-booking の planHours（light_window 設定）で行う。
-- ここでは店頭・会員一覧・入会フォームに出る note だけを直す（判定には使っていない）。

update public.frunk_plans
set note = '月4回まで／平日10:00〜15:00のご利用（土日祝は不可）※表示は税抜',
    updated_at = now()
where name = 'ライト会員'
  and deleted_at is null;
