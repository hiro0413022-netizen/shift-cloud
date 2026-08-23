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
const FOLLOW_URL = "https://member-os-tau.vercel.app/follow";

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

/**
 * @param storeIds 店舗スコープ（#134）。null/未指定＝会社全体（cronはactorが無いのでこちら）。
 *                 画面から人が叩く場合だけ、その人の配属店舗を渡す。
 */
export async function runMorningDigest(companyId: string, storeIds?: string[] | null): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  const allowedStores = Array.isArray(storeIds) ? new Set(storeIds) : null;
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
  // #134: 体験申込（GOLF WING/FRANK 両方が入る）と Web入会（FRANK）を混ぜて「合計◯件」と出すと、
  //       どちらの店の話か分からない。store_id を取って店舗名を明記して並べる。
  // ＜AI店長＞（#149）: 判断待ちとは別に「店の今」＝昨日の売上・今日の予約・要フォローを毎朝並べる
  const yesterday = jstYmd(new Date(Date.now() - 24 * 3600_000));
  const followDue = jstYmd(new Date(Date.now() - 7 * 24 * 3600_000));
  const followSince = jstYmd(new Date(Date.now() - 60 * 24 * 3600_000));

  const [queueRes, delivRes, inqRes, trialRes, joinRes, aiEvents, storesRes, salesRes, bookRes, followRes] = await Promise.all([
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
    admin.from("mbr_trial_requests").select("store_id").eq("company_id", companyId).eq("status", "pending").is("deleted_at", null),
    admin.from("frunk_members").select("store_id").eq("company_id", companyId).eq("status", "pending").is("deleted_at", null),
    admin
      .from("company_events")
      .select("title")
      .eq("company_id", companyId)
      .eq("source_type", "ai")
      .gte("occurred_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("occurred_at", { ascending: false })
      .limit(3),
    admin.from("stores").select("id, name").eq("company_id", companyId).is("deleted_at", null),
    admin
      .from("mon_sales")
      .select("store_id, amount, source")
      .eq("company_id", companyId)
      .eq("sold_on", yesterday)
      .is("deleted_at", null),
    admin
      .from("frunk_bookings")
      .select("store_id")
      .eq("company_id", companyId)
      .eq("booked_date", today)
      .neq("status", "cancelled")
      .is("deleted_at", null),
    admin
      .from("mbr_walkin_visits")
      .select("store_id, result")
      .eq("company_id", companyId)
      .eq("visit_type", "trial")
      .is("deleted_at", null)
      .is("follow_up_at", null)
      .gte("visited_on", followSince)
      .lte("visited_on", followDue),
  ]);

  // 店舗名の解決（#134）。store_id が無い行は「店舗未設定」として別に出す＝黙って合算しない
  const storeName = new Map(((storesRes.data ?? []) as Array<{ id: string; name: string }>).map((s) => [String(s.id), String(s.name)]));
  const inScope = (sid: unknown) => !allowedStores || sid == null || allowedStores.has(String(sid));
  const byStore = (rows: Array<{ store_id: string | null }> | null) => {
    const m = new Map<string, number>();
    for (const r of (rows ?? []).filter((r) => inScope(r.store_id))) {
      const key = r.store_id ? storeName.get(String(r.store_id)) ?? "店舗未設定" : "店舗未設定";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  };
  const trialByStore = byStore(trialRes.data as Array<{ store_id: string | null }> | null);
  const joinByStore = byStore(joinRes.data as Array<{ store_id: string | null }> | null);
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const trialCount = sum(trialByStore);
  const joinCount = sum(joinByStore);
  const fmtByStore = (label: string, m: Map<string, number>) =>
    [...m.entries()].map(([store, n]) => `${label}（${store}）${n}`);

  const approvals = (queueRes.data ?? []).length;
  const total = approvals + (delivRes.count ?? 0) + (inqRes.count ?? 0) + trialCount + joinCount;

  const lines: string[] = [`おはようございます。${jstDateJa()} のダイジェストです。`, ""];
  if (total === 0) {
    lines.push("今日の判断はありません。AIが回しています。");
  } else {
    lines.push(`今日の判断: ${total}件`);
    for (const q of queueRes.data ?? []) lines.push(`・${String(q.title).slice(0, 40)}`);
    const others: string[] = [];
    // #134: 体験申込・入会申込は店舗を明記（GOLF WING と FRANK を1つの数字にしない）
    others.push(...fmtByStore("体験申込", trialByStore));
    others.push(...fmtByStore("入会申込", joinByStore));
    if ((inqRes.count ?? 0) > 0) others.push(`問い合わせ${inqRes.count}`);
    if ((delivRes.count ?? 0) > 0) others.push(`成果物${delivRes.count}`);
    if (others.length > 0) lines.push(`・その他: ${others.join(" / ")}`);
  }
  // ＜AI店長＞（#149）: 店の数字。判断リストと分けて毎朝同じ形で出す
  const salesRows = ((salesRes.data ?? []) as Array<{ store_id: string | null; amount: number | null; source: string | null }>)
    .filter((r) => inScope(r.store_id))
    // 台帳ロールアップ（source='ledger'）は日次明細の合算行。当日入力（app等）と混ぜると
    // 二重計上になるため除外する（/analysis の proSales と同じ理由・money-os #98）
    .filter((r) => r.source !== "ledger");
  const salesByStore = new Map<string, number>();
  for (const r of salesRows) {
    const key = r.store_id ? storeName.get(String(r.store_id)) ?? "店舗未設定" : "店舗未設定";
    salesByStore.set(key, (salesByStore.get(key) ?? 0) + Number(r.amount ?? 0));
  }
  const bookCount = ((bookRes.data ?? []) as Array<{ store_id: string | null }>).filter((r) => inScope(r.store_id)).length;
  const followDueRows = ((followRes.data ?? []) as Array<{ store_id: string | null; result: string | null }>)
    .filter((r) => inScope(r.store_id))
    // /follow と同じ条件: 入会済みは対象外（resultはnullではなく'none'既定だがJS側でも揃えて弾く）
    .filter((r) => r.result !== "join");
  lines.push("", "＜AI店長＞");
  lines.push(
    salesByStore.size > 0
      ? `・昨日の売上: ${[...salesByStore.entries()].map(([st, n]) => `${st} ${n.toLocaleString("ja-JP")}円`).join(" / ")}`
      : "・昨日の売上: 入力なし"
  );
  lines.push(`・今日の予約（FRANK）: ${bookCount}件`);
  lines.push(`・要フォロー: ${followDueRows.length}件（体験から7日以上・未入会）`);
  if (followDueRows.length > 0) lines.push(`  文面はAI店長が用意しています → ${FOLLOW_URL}`);

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
    observed: {
      total,
      approvals,
      trials: trialCount,
      joins: joinCount,
      inquiries: inqRes.count ?? 0,
      // #134: あとから「どの店の話だったか」を追えるように店舗別も残す
      trials_by_store: Object.fromEntries(trialByStore),
      joins_by_store: Object.fromEntries(joinByStore),
      // ＜AI店長＞（#149）
      sales_yesterday: Object.fromEntries(salesByStore),
      bookings_today: bookCount,
      follow_due: followDueRows.length,
    },
    decision: "act",
    reason: "毎朝の定期配信",
  });
  return { sent: true, total };
}
