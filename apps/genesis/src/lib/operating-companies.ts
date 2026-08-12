import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Genesis の自動処理（日次レポート・AIループ・実行キュー）を回してよい会社を返す（#134c）。
 *
 * 判定は「**稼働中の店舗を1つ以上持っているか**」。
 *
 * 理由: `companies` には SWING CORTEX（外販SaaS）のテナントも入る。テナントは店舗を持たず、
 * コーチング用のアカウント1つだけがぶら下がる。ところが cron は `companies` を丸ごとなめており、
 * そういう「中身のないテナント」にも毎朝の日次レポート・AIループ・朝のLINEダイジェストを
 * 生成していた（実例: 会社「FRANK GOLF」に 2026-07-24〜08-12 のあいだ日次レポートが毎日でき、
 * AI実行ログが76件たまっていた。店舗も売上も勤怠も無いので中身は空）。
 *
 * 会社を消すのではなく**回す対象を絞る**のがこの設計の要点。テナントの分離は SWING CORTEX の
 * 仕様どおり正しいので、消すとコーチングのログイン（use_coaching）とデータ境界まで壊れる。
 *
 * 新しい外販テナントが増えても自動で除外される（店舗を登録した時点で対象に入る）。
 */
export async function listOperatingCompanyIds(
  admin: SupabaseClient,
): Promise<string[]> {
  const { data: stores } = await admin
    .from("stores")
    .select("company_id")
    .eq("status", "active")
    .is("deleted_at", null);

  const withStores = new Set(
    ((stores ?? []) as Array<{ company_id: string }>).map((s) => String(s.company_id)),
  );

  const { data: companies } = await admin
    .from("companies")
    .select("id")
    .is("deleted_at", null);

  return ((companies ?? []) as Array<{ id: string }>)
    .map((c) => String(c.id))
    .filter((id) => withStores.has(id));
}
