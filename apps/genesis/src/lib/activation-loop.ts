import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { jstYmd } from "@/lib/jst";

type Admin = ReturnType<typeof createAdmin>;

/**
 * 稼働化プログラム（P3 / #82 / REDESIGN §5f）
 * 「作ったが使われていない」を構造的に無くす週次ループ（毎週月曜・日次cronから起動）。
 * 観測: 各システムの直近14日の利用数
 * 判断: 0件が続くシステムは「稼働化する / 凍結する」の改善提案を起票
 *        → ai_suggestions に入り、ホームの判断フィードに表示される
 * 記録: gn_loop_runs（code=system_activation）
 */

const LOOP_CODE = "system_activation";

const SYSTEMS: Array<{ code: string; table: string; label: string; hint: string }> = [
  {
    code: "reserve-os",
    table: "res_requests",
    label: "Reserve OS（ビジター予約）",
    hint: "公式LINEリッチメニューやHPに予約URLを掲出する / 使わないなら凍結",
  },
  {
    code: "survey-os",
    table: "svy_responses",
    label: "Survey OS（アンケート）",
    hint: "店頭QR掲出・LINE配信でアンケートを配る / 使わないなら凍結",
  },
  {
    code: "lesson-os",
    table: "lsn_videos",
    label: "Lesson OS（レッスン記録）",
    hint: "コーチにuse_lesson権限を付与し実運用を開始する（NEXT_TASKS A-2） / 使わないなら凍結",
  },
  {
    code: "legal-os",
    table: "leg_documents",
    label: "Legal OS（契約書管理）",
    hint: "既存契約書を投入して期限管理を開始する / 使わないなら凍結",
  },
];

export async function runActivationLoop(companyId: string): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  const today = jstYmd();
  // 月曜のみ（JST）
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (dow !== 1) return { skipped: "not_monday" };

  let { data: loop } = await admin
    .from("gn_loops")
    .select("id, enabled")
    .eq("company_id", companyId)
    .eq("code", LOOP_CODE)
    .maybeSingle();
  if (!loop) {
    const ins = await admin
      .from("gn_loops")
      .insert({ company_id: companyId, code: LOOP_CODE, name: "稼働化プログラム（週次）", config: { window_days: 14 } })
      .select("id, enabled")
      .single();
    loop = ins.data;
  }
  if (!loop || loop.enabled === false) return { skipped: "disabled" };

  const { data: existing } = await admin
    .from("gn_loop_runs")
    .select("id")
    .eq("loop_id", loop.id)
    .eq("run_date", today)
    .maybeSingle();
  if (existing) return { skipped: "already_ran" };

  const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  const observed: Record<string, number | null> = {};
  const idle: string[] = [];

  for (const sys of SYSTEMS) {
    try {
      const { count, error } = await admin
        .from(sys.table)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      observed[sys.code] = count ?? 0;
      if ((count ?? 0) === 0) idle.push(sys.code);
    } catch {
      observed[sys.code] = null; // テーブル差異は握って続行
    }
  }

  // 0件システムごとに改善提案（既にオープンな同種提案があれば重複起票しない）
  let raised = 0;
  for (const code of idle) {
    const sys = SYSTEMS.find((s) => s.code === code)!;
    const title = `${sys.label}: 直近2週間の利用ゼロ`;
    const { data: dup } = await admin
      .from("ai_suggestions")
      .select("id")
      .eq("company_id", companyId)
      .eq("title", title)
      .eq("approval_status", "pending")
      .limit(1)
      .maybeSingle();
    if (dup) continue;
    await admin.from("ai_suggestions").insert({
      company_id: companyId,
      kind: "custom",
      severity: "warning",
      title,
      body: "作ったのに使われていない状態です。稼働化（導線掲出・権限付与・周知）か凍結（Vercel停止・画面から撤去）を判断してください。",
      suggested_action: sys.hint,
      source: "rule",
    });
    raised += 1;
  }

  await admin.from("gn_loop_runs").insert({
    company_id: companyId,
    loop_id: loop.id,
    run_date: today,
    observed,
    decision: raised > 0 ? "act" : "skip",
    reason: raised > 0 ? `利用ゼロ ${idle.join(", ")} に稼働化/凍結の判断を起票` : "全システムに利用あり",
  });

  if (raised > 0) {
    await logEvent(companyId, {
      event_type: "ai.activation_loop",
      title: `稼働化プログラム: 利用ゼロのシステム${raised}件に判断を起票（${idle.join(", ")}）`,
      source: "activation_loop",
      source_type: "ai",
    });
  }
  return { observed, idle, raised };
}
