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
 * 実行: line_broadcast（approval）で顧客向け公式LINE（ビジター用）へ直接一斉配信（#80でA-4解消）
 *        ホームで承認 → LINE API broadcast が即実行される。文面はカードで確認・却下可能。
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

function buildMessage(): string {
  // 顧客（ビジター用OAの友だち）に直接届く文面。数字や社内事情は書かない。
  return [
    `⛳ GOLF WINGで体験レッスン受付中！`,
    ``,
    `8月から料金が新しくなります。現行条件でスタートできるのは今だけ。`,
    `初心者の方も大歓迎、手ぶらでOK。コーチがマンツーマンでスイングを見ます。`,
    ``,
    `▼体験のご予約・お問い合わせ`,
    `このLINEに「体験希望」と返信してください。`,
  ].join("\n");
}

/**
 * 測定（P3 / #82）: act から7日経過した run の結果を実測して result に書き、
 * CEO AI・ホームのティッカーに「打ち手→結果」を流す。学習の材料。
 */
async function measurePastRuns(admin: Admin, companyId: string): Promise<number> {
  const cutoff = jstYmd(new Date(Date.now() - 7 * 24 * 3600_000));
  const { data: runs } = await admin
    .from("gn_loop_runs")
    .select("id, run_date")
    .eq("company_id", companyId)
    .eq("decision", "act")
    .is("result", null)
    .lte("run_date", cutoff)
    .limit(5);
  let measured = 0;
  for (const run of runs ?? []) {
    const start = `${String(run.run_date)}T00:00:00+09:00`;
    const endDate = new Date(new Date(`${String(run.run_date)}T00:00:00+09:00`).getTime() + 7 * 24 * 3600_000);
    const end = endDate.toISOString();
    const [bk, rq, rep] = await Promise.all([
      admin
        .from("mbr_walkin_visits")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("visit_type", "trial")
        .is("deleted_at", null)
        .gte("created_at", start)
        .lt("created_at", end),
      admin
        .from("mbr_trial_requests")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("created_at", start)
        .lt("created_at", end),
      admin
        .from("sec_inquiries")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("source", "line")
        .eq("inquiry_type", "trial")
        .gte("received_at", start)
        .lt("received_at", end),
    ]);
    const trials = (bk.count ?? 0) + (rq.count ?? 0);
    const replies = rep.count ?? 0;
    await admin
      .from("gn_loop_runs")
      .update({ result: { trials_7d: trials, line_trial_replies_7d: replies, measured_at: new Date().toISOString() } })
      .eq("id", run.id);
    await logEvent(companyId, {
      event_type: "ai.sales_loop_result",
      title: `営業AI測定: ${String(run.run_date)}配信の7日間で体験申込${trials}件・LINE体験返信${replies}件`,
      source: "sales_loop",
      source_type: "ai",
    });
    measured += 1;
  }
  return measured;
}

export async function runSalesLoop(companyId: string): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  const loop = await ensureLoop(admin, companyId);
  if (!loop) return { skipped: "loop_init_failed" };
  if (loop.enabled === false) return { skipped: "disabled" };

  // 先に過去の打ち手を測定（P3: 実行→測定→学習のループを閉じる）
  const measured = await measurePastRuns(admin, companyId).catch(() => 0);
  void measured;

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
    // GW: 一時利用者名簿の体験（旧 mbr_trial_bookings は空・#93）
    admin
      .from("mbr_walkin_visits")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("visit_type", "trial")
      .gte("visited_on", monthStart)
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

  // ---- 生成 → 実行（approval: ホームの判断フィードで文面確認→承認で即配信） ----
  // 学習適用（0090）: 過去にユーザーが出した修正指示を文面生成に反映する。
  // ルール無し・APIキー無し・失敗時はテンプレートのまま（安全側フォールバック）。
  const { applyLearnedRules } = await import("@/lib/feedback");
  const base = buildMessage();
  const { body, appliedRules } = await applyLearnedRules(admin, companyId, "line_broadcast", base).catch(() => ({
    body: base,
    appliedRules: [] as string[],
  }));
  const enq = await enqueueAction(admin, {
    companyId,
    actionType: "line_broadcast",
    title: `営業AI: 体験掘り起こしLINE配信（ビジター向け・不足${shortfall}件）`,
    payload: { channel: "gw_visitor", body, applied_rules: appliedRules },
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
