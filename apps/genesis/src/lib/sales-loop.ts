import { createAdmin } from "@/lib/supabase/admin";
import { enqueueAction } from "@/lib/ai-execution";
import { logEvent } from "@/lib/kernel";
import { jstYmd, jstMonthStart } from "@/lib/jst";

type Admin = ReturnType<typeof createAdmin>;

/**
 * 営業AIループ v1「体験予約を目標ペースに戻す」（REDESIGN_2026-07 §4-1 / DECISIONS #77）
 *
 * 観測: 当月の体験（GW=mbr_trial_bookings.lesson_date / FRANK=mbr_trial_requests.created_at）
 *        vs kpis.trial_bookings の月次目標の日割りペース
 * 判断: 不足が config.min_shortfall 以上 かつ 直近 config.cooldown_days 日以内に act していない
 * 生成: 掘り起こし配信文（テンプレート。スタッフが配信前に調整できる前提の下書き）
 * 実行: staff_directive（approval）で「公式LINEでの配信依頼」をスタッフへ
 *        ※顧客LINEへの直接配信は実チャネル未接続（NEXT_TASKS A-4）のため、
 *          v1は「配信文を作って依頼する」まで。チャネル開通後に line_broadcast 直送へ切替。
 * 記録: gn_loop_runs（1日1回・観測値と文面を保存。P3で結果測定を追記）
 */

const LOOP_CODE = "sales_trial_recovery";

type LoopRow = {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

async function ensureLoop(admin: Admin, companyId: string): Promise<LoopRow | null> {
  const { data } = await admin
    .from("gn_loops")
    .select("id, enabled, config")
    .eq("company_id", companyId)
    .eq("code", LOOP_CODE)
    .maybeSingle();
  if (data) return data as LoopRow;
  const { data: inserted } = await admin
    .from("gn_loops")
    .insert({
      company_id: companyId,
      code: LOOP_CODE,
      name: "営業: 体験予約リカバリー",
      config: { min_shortfall: 1, cooldown_days: 7 },
    })
    .select("id, enabled, config")
    .single();
  return (inserted as LoopRow) ?? null;
}

function buildMessage(shortfall: number, actual: number, target: number): string {
  return [
    `【営業AI】体験予約リカバリー配信のお願い`,
    ``,
    `今月の体験予約が目標ペース比 ${shortfall}件不足しています（実績${actual}件 / 月間目標${target}件・本日時点）。`,
    `以下の下書きを調整のうえ、GOLF WING公式LINEでの配信をお願いします。`,
    ``,
    `――― 配信文（下書き） ―――`,
    `⛳ GOLF WINGで体験レッスン受付中！`,
    ``,
    `8月から料金が新しくなります。現行条件でスタートできるのは今だけ。`,
    `初心者の方も大歓迎、手ぶらでOK。コーチがマンツーマンでスイングを見ます。`,
    ``,
    `▼体験のご予約・お問い合わせ`,
    `このLINEに「体験希望」と返信してください。`,
    `――――――――――――――`,
  ].join("\n");
}

export async function runSalesLoop(companyId: string): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  const loop = await ensureLoop(admin, companyId);
  if (!loop) return { skipped: "loop_init_failed" };
  if (loop.enabled === false) return { skipped: "disabled" };

  const today = jstYmd();
  const { data: existing } = await admin
    .from("gn_loop_runs")
    .select("id")
    .eq("loop_id", loop.id)
    .eq("run_date", today)
    .maybeSingle();
  if (existing) return { skipped: "already_ran_today" };

  // ---- 観測 ----
  const monthStart = jstMonthStart(0);
  const [gwRes, frRes, kpiRes] = await Promise.all([
    admin
      .from("mbr_trial_bookings")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("lesson_date", monthStart)
      .is("deleted_at", null),
    admin
      .from("mbr_trial_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", monthStart),
    admin
      .from("kpis")
      .select("target_value")
      .eq("company_id", companyId)
      .eq("code", "trial_bookings")
      .maybeSingle(),
  ]);

  const actual = (gwRes.count ?? 0) + (frRes.count ?? 0);
  const target = Number(kpiRes.data?.target_value ?? 0);
  const day = Number(today.slice(8, 10));
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const expected = target > 0 ? Math.floor((target * day) / daysInMonth) : 0;
  const shortfall = Math.max(0, expected - actual);

  const cfg = loop.config ?? {};
  const minShortfall = Number(cfg.min_shortfall ?? 1);
  const cooldownDays = Number(cfg.cooldown_days ?? 7);

  const observed = { actual, target, expected, shortfall, month_start: monthStart, as_of: today };

  const saveRun = async (
    decision: "act" | "skip",
    reason: string,
    deliverable: string | null,
    actionQueueId: string | null
  ) => {
    await admin.from("gn_loop_runs").insert({
      company_id: companyId,
      loop_id: loop.id,
      run_date: today,
      observed,
      decision,
      reason,
      deliverable,
      action_queue_id: actionQueueId,
    });
  };

  // ---- 判断 ----
  if (target <= 0) {
    await saveRun("skip", "trial_bookings の目標値が未設定", null, null);
    return { decision: "skip", reason: "no_target", observed };
  }
  if (shortfall < minShortfall) {
    await saveRun("skip", `不足${shortfall}件 < しきい値${minShortfall}件（順調）`, null, null);
    return { decision: "skip", reason: "on_pace", observed };
  }

  const cooldownSince = new Date(Date.now() - cooldownDays * 24 * 3600_000).toISOString().slice(0, 10);
  const { data: recentAct } = await admin
    .from("gn_loop_runs")
    .select("id")
    .eq("loop_id", loop.id)
    .eq("decision", "act")
    .gte("run_date", cooldownSince)
    .limit(1)
    .maybeSingle();
  if (recentAct) {
    await saveRun("skip", `直近${cooldownDays}日以内に打ち手実行済み（クールダウン中）`, null, null);
    return { decision: "skip", reason: "cooldown", observed };
  }

  // ---- 生成 → 実行（approval: ホームの判断フィードに乗る） ----
  const body = buildMessage(shortfall, actual, target);
  const enq = await enqueueAction(admin, {
    companyId,
    actionType: "staff_directive",
    title: `営業AI: 体験リカバリー配信の依頼（不足${shortfall}件）`,
    payload: { body },
    originKind: "sales_loop",
    dedupeKey: `sales-trial-recovery-${today}`,
    createdBy: null,
  });

  await saveRun("act", `不足${shortfall}件 ≧ しきい値${minShortfall}件`, body, enq.id);
  await logEvent(companyId, {
    event_type: "ai.sales_loop",
    title: `営業AIが体験不足${shortfall}件を検知 → リカバリー配信を起案（承認待ち）`,
    source: "sales_loop",
    source_type: "ai",
  });
  return { decision: "act", observed, queued: enq };
}
