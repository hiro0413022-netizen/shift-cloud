import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import {
  sortStalled,
  stalledFromCron,
  stalledFromFailedActions,
  stalledFromMail,
  stalledFromOutbox,
  type FailedAction,
  type StalledItem,
} from "@/lib/stalled-pure";

export type { StalledItem } from "@/lib/stalled-pure";

/**
 * 「止まっているもの」を集める（#244 ①）。ホームの最上段に赤で固定する。
 * 見る場所は4つ: AI実行の失敗 / メール送信の設定と失敗 / 日次レポートの停止 / LINE配信キューのエラー。
 * どれかのクエリが落ちても他は出す（判断フィードと同じ方針）。
 * 確認済み（gn_alert_acks）は呼び出し側で除く。
 */
export async function getStalledItems(companyId: string): Promise<StalledItem[]> {
  const admin = createAdmin();
  const now = new Date();
  const d3 = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const d7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [failedRes, mailRes, reportRes, outboxRes] = await Promise.all([
    admin
      .from("ai_action_queue")
      .select("action_type, error, executed_at")
      .eq("company_id", companyId)
      .eq("status", "failed")
      .gte("executed_at", d3)
      .order("executed_at", { ascending: false })
      .limit(200)
      .then((r) => (r.error ? [] : ((r.data ?? []) as { action_type: string; error: string | null; executed_at: string | null }[]))),
    admin
      .from("company_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("event_type", ["trial.mail_failed", "frunk.reminder_skipped", "join.mail_failed"])
      .gte("occurred_at", d7)
      .then((r) => (r.error ? 0 : (r.count ?? 0))),
    admin
      .from("company_events")
      .select("occurred_at")
      .eq("company_id", companyId)
      .eq("event_type", "report.daily")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .then((r) => (r.error ? null : ((r.data?.[0]?.occurred_at as string | undefined) ?? null))),
    admin
      .from("gn_line_outbox")
      .select("error, created_at")
      .eq("company_id", companyId)
      .eq("status", "error")
      .gte("created_at", d3)
      .order("created_at", { ascending: false })
      .limit(50)
      .then((r) => (r.error ? [] : ((r.data ?? []) as { error: string | null; created_at: string }[]))),
  ]);

  // action_type ごとにまとめる（同じ失敗が20行並んでも1行で出す）
  const grouped = new Map<string, FailedAction>();
  for (const r of failedRes) {
    const g = grouped.get(r.action_type) ?? { action_type: r.action_type, error: r.error, count: 0, last: r.executed_at };
    g.count += 1;
    grouped.set(r.action_type, g);
  }

  return sortStalled([
    ...stalledFromFailedActions(Array.from(grouped.values())),
    ...stalledFromMail({ hasResendKey: Boolean(process.env.RESEND_API_KEY), failedMails7d: mailRes }),
    ...stalledFromCron({ lastDailyReportAt: reportRes, now }),
    ...stalledFromOutbox({ errorCount: outboxRes.length, lastError: outboxRes[0]?.error ?? null }),
  ]);
}
