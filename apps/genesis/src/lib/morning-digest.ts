import { createAdmin } from "@/lib/supabase/admin";
import { getLineChannel, linePush } from "@/lib/line";
import { jstYmd, jstDateJa } from "@/lib/jst";

type Admin = ReturnType<typeof createAdmin>;

/**
 * 朝の個人LINEダイジェスト（#83 / REDESIGN §10-1）
 * 古川さんの個人LINEへ「今日の判断」の要約を毎朝push。1タップでホームへ。
 * 宛先userIdは gn_loops(morning_digest).config.line_user_id。
 * 未設定の場合はスタッフ用OAへの1:1メッセージ（webhookが sec_inquiries に保存）から自動採用する。
 */

const LOOP_CODE = "morning_digest";
const HOME_URL = "https://yozan-genesis.vercel.app/";

async function resolveUserId(admin: Admin, companyId: string, loopId: string, config: Record<string, unknown>): Promise<string | null> {
  const existing = config?.line_user_id ? String(config.line_user_id) : null;
  if (existing) return existing;
  // スタッフ用OAへの1:1返信から自動採用（スタッフグループではなく個人トーク＝古川さん想定）
  const { data } = await admin
    .from("sec_inquiries")
    .select("proposed_event")
    .eq("company_id", companyId)
    .eq("source", "line")
    .order("received_at", { ascending: false })
    .limit(10);
  for (const r of data ?? []) {
    const pe = (r.proposed_event ?? {}) as Record<string, unknown>;
    if (String(pe.line_channel ?? "") === "staff" && pe.line_user_id) {
      const userId = String(pe.line_user_id);
      await admin
        .from("gn_loops")
        .update({ config: { ...config, line_user_id: userId }, updated_at: new Date().toISOString() })
        .eq("id", loopId);
      return userId;
    }
  }
  return null;
}

export async function runMorningDigest(companyId: string): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  let { data: loop } = await admin
    .from("gn_loops")
    .select("id, enabled, config")
    .eq("company_id", companyId)
    .eq("code", LOOP_CODE)
    .maybeSingle();
  if (!loop) {
    const ins = await admin
      .from("gn_loops")
      .insert({ company_id: companyId, code: LOOP_CODE, name: "朝の個人LINEダイジェスト", config: {} })
      .select("id, enabled, config")
      .single();
    loop = ins.data;
  }
  if (!loop || loop.enabled === false) return { skipped: "disabled" };

  const today = jstYmd();
  const { data: existing } = await admin
    .from("gn_loop_runs")
    .select("id")
    .eq("loop_id", loop.id)
    .eq("run_date", today)
    .maybeSingle();
  if (existing) return { skipped: "already_sent" };

  const userId = await resolveUserId(admin, companyId, String(loop.id), (loop.config ?? {}) as Record<string, unknown>);
  if (!userId) return { skipped: "no_user_id（スタッフ用OAへ1:1で一言送ると自動設定されます）" };

  const staffCh = await getLineChannel(admin, companyId, "staff");
  if (!staffCh) return { skipped: "no_staff_channel" };

  // 判断待ちの件数と先頭タイトル
  const [queueRes, delivRes, inqRes, trialRes, joinRes, aiEvents] = await Promise.all([
    admin
      .from("ai_action_queue")
      .select("title")
      .eq("company_id", companyId)
      .eq("status", "awaiting_approval")
      .order("created_at", { ascending: true })
      .limit(3),
    admin.from("ai_execution_logs").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("review_status", "pending"),
    admin
      .from("sec_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["new", "awaiting_approval"])
      .is("deleted_at", null),
    admin.from("mbr_trial_requests").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
    admin.from("frunk_members").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
    admin
      .from("company_events")
      .select("title")
      .eq("company_id", companyId)
      .eq("source_type", "ai")
      .gte("occurred_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("occurred_at", { ascending: false })
      .limit(3),
  ]);

  const approvals = (queueRes.data ?? []).length;
  const total = approvals + (delivRes.count ?? 0) + (inqRes.count ?? 0) + (trialRes.count ?? 0) + (joinRes.count ?? 0);

  const lines: string[] = [`おはようございます。${jstDateJa()} のダイジェストです。`, ""];
  if (total === 0) {
    lines.push("今日の判断はありません。AIが回しています。");
  } else {
    lines.push(`今日の判断: ${total}件`);
    for (const q of queueRes.data ?? []) lines.push(`・${String(q.title).slice(0, 40)}`);
    const others: string[] = [];
    if ((trialRes.count ?? 0) > 0) others.push(`体験申込${trialRes.count}`);
    if ((joinRes.count ?? 0) > 0) others.push(`入会申込${joinRes.count}`);
    if ((inqRes.count ?? 0) > 0) others.push(`問い合わせ${inqRes.count}`);
    if ((delivRes.count ?? 0) > 0) others.push(`成果物${delivRes.count}`);
    if (others.length > 0) lines.push(`・その他: ${others.join(" / ")}`);
  }
  const ev = aiEvents.data ?? [];
  if (ev.length > 0) {
    lines.push("", "昨日のAIの動き:");
    for (const e of ev) lines.push(`・${String(e.title).slice(0, 50)}`);
  }
  lines.push("", `▼判断はこちらから`, HOME_URL);

  await linePush(staffCh.access_token, userId, lines.join("\n"));

  await admin.from("gn_loop_runs").insert({
    company_id: companyId,
    loop_id: loop.id,
    run_date: today,
    observed: { total, approvals, trials: trialRes.count ?? 0, joins: joinRes.count ?? 0, inquiries: inqRes.count ?? 0 },
    decision: "act",
    reason: "毎朝の定期配信",
  });
  return { sent: true, total };
}
