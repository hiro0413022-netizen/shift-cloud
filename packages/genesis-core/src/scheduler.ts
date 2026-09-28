/**
 * Scheduler（P2-a・#292）— cron 1本から呼ぶ Core のジョブ群。
 *
 *   processEvents()  … gn_events の未処理を拾い、処理済みにする（P3 で Workflow trigger をここに挿す）
 *   evaluateRules()  … gn_rules を gnv_* ビューで評価し、行が返れば ai_suggestions（判断フィード）へ起票。action_tool があれば Act（#294）
 *   nudgeWaiting()   … gn_waiting の期限切れに「そろそろフォローしますか？」を起票
 *   withJobRun()     … 実行記録（gn_job_runs）。Self Healing はこれを見る
 *
 * 数字はすべて Postgres が計算（gn_chat_query・hq スコープ）。LLM は使わない＝毎 tick 走っても課金ゼロ。
 */
import type { AdminLike } from "./tool.ts";

type Row = Record<string, unknown>;

/**
 * 定期処理の「期待」（Self Healing の物差し・#296）。job ごとに「この分数を超えて走っていなければ止まっている」。
 * 記録は withJobRun が gn_job_runs に残す。demo-sales の cron もここに書く（実行は各アプリ・記録は1つの台帳）。
 */
export const JOB_EXPECTATIONS: Array<{ job: string; maxAgeMin: number; label: string }> = [
  { job: "cron:execute", maxAgeMin: 30, label: "10分ごとの実行キュー・イベント・ルール" },
  { job: "cron:daily", maxAgeMin: 26 * 60, label: "毎朝の日次処理（CEOレポート・月会費・KPI）" },
  { job: "cron:prospect", maxAgeMin: 26 * 60, label: "営業先の自動ピックアップ（demo-sales）" },
  { job: "cron:outreach", maxAgeMin: 2 * 60, label: "営業メールの毎時tick（demo-sales）" },
];

export type StaleJob = { job: string; label: string; ageMin: number | null; maxAgeMin: number; lastOk: boolean | null; lastError: string | null };

/** 止まっている定期処理（gn_job_runs を JOB_EXPECTATIONS と突き合わせる）。health.check と Dev Dashboard が使う */
export async function staleJobs(admin: AdminLike, now = new Date()): Promise<StaleJob[]> {
  const out: StaleJob[] = [];
  for (const e of JOB_EXPECTATIONS) {
    let last: Row | null = null;
    try {
      const { data } = await admin.from("gn_job_runs").select("started_at, ok, error").eq("job", e.job).order("started_at", { ascending: false }).limit(1).maybeSingle();
      last = (data ?? null) as Row | null;
    } catch {
      /* 未適用 */
    }
    const ageMin = last?.started_at ? Math.round((now.getTime() - Date.parse(String(last.started_at))) / 60_000) : null;
    const stale = ageMin === null || ageMin > e.maxAgeMin;
    const failing = last?.ok === false;
    if (stale || failing) out.push({ job: e.job, label: e.label, ageMin, maxAgeMin: e.maxAgeMin, lastOk: last?.ok == null ? null : Boolean(last.ok), lastError: last?.error ? String(last.error) : null });
  }
  return out;
}

export async function withJobRun<T>(admin: AdminLike, job: string, companyId: string | null, fn: () => Promise<T>): Promise<{ ok: boolean; result?: T; error?: string }> {
  const { data: run } = await admin.from("gn_job_runs").insert({ job, company_id: companyId }).select("id").single().then((r: { data: Row | null }) => r, () => ({ data: null }));
  const id = run?.id ? String(run.id) : null;
  try {
    const result = await fn();
    if (id) await admin.from("gn_job_runs").update({ finished_at: new Date().toISOString(), ok: true, summary: result as Row }).eq("id", id);
    return { ok: true, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (id) await admin.from("gn_job_runs").update({ finished_at: new Date().toISOString(), ok: false, error }).eq("id", id);
    return { ok: false, error };
  }
}

/* ---------- イベント処理 ---------- */
export type EventHandler = (admin: AdminLike, event: Row) => Promise<void>;

/** type → ハンドラ。P2-a は Waiting の自動クローズだけ。P3 で gn_workflows の trigger をここへ */
export const EVENT_HANDLERS: Record<string, EventHandler[]> = {
  "inquiry.replied": [
    async (admin, e) => {
      // 返信したら「返事待ち」を立てる（3日）
      await admin.from("gn_waiting").insert({
        company_id: e.company_id, entity_kind: "inquiry", entity_id: e.entity_id, entity_label: String((e.payload as Row)?.from ?? "お客様"),
        what: "返信への返事", status: "open", expected_by: new Date(Date.now() + 3 * 86_400_000).toISOString(), source: `event:${e.type}`,
      });
    },
  ],
  "inquiry.received": [
    async (admin, e) => {
      // 同じ人から来たら「返事待ち」を閉じる
      const from = String((e.payload as Row)?.from ?? "");
      if (!from) return;
      await admin.from("gn_waiting").update({ status: "done", closed_at: new Date().toISOString(), closed_reason: `event:${e.type}` })
        .eq("company_id", e.company_id).eq("status", "open").eq("entity_kind", "inquiry").eq("entity_label", from);
    },
  ],
  "payment.completed": [
    async (admin, e) => {
      await admin.from("gn_waiting").update({ status: "done", closed_at: new Date().toISOString(), closed_reason: `event:${e.type}` })
        .eq("company_id", e.company_id).eq("status", "open").eq("entity_kind", "reservation").eq("entity_id", e.entity_id);
    },
  ],
};

export async function processEvents(admin: AdminLike, companyId: string, limit = 200): Promise<{ picked: number; handled: number; failed: number }> {
  const { data } = await admin.from("gn_events").select("*").eq("company_id", companyId).is("processed_at", null).lt("attempts", 5).order("occurred_at", { ascending: true }).limit(limit);
  const events = (data ?? []) as Row[];
  let handled = 0;
  let failed = 0;
  for (const e of events) {
    const hs = EVENT_HANDLERS[String(e.type)] ?? [];
    try {
      for (const h of hs) await h(admin, e);
      await admin.from("gn_events").update({ processed_at: new Date().toISOString() }).eq("id", e.id);
      handled += 1;
    } catch (err) {
      failed += 1;
      // 失敗は別に退避（古い順にN件で詰まらせない・#126 の教訓）: attempts を上げて次回は後回し
      await admin.from("gn_events").update({ attempts: Number(e.attempts ?? 0) + 1, last_error: err instanceof Error ? err.message : String(err) }).eq("id", e.id);
    }
  }
  return { picked: events.length, handled, failed };
}

/* ---------- Proactive ルール ---------- */
function due(rule: Row, now: Date): boolean {
  if (!rule.enabled) return false;
  const last = rule.last_fired_at ? Date.parse(String(rule.last_fired_at)) : 0;
  const cooldownMs = Number(rule.cooldown_hours ?? 24) * 3600_000;
  if (now.getTime() - last < cooldownMs) return false;
  const jstHour = (now.getUTCHours() + 9) % 24;
  const jstDow = new Date(now.getTime() + 9 * 3600_000).getUTCDay();
  if (rule.schedule === "daily") return jstHour >= 6; // 朝6時以降の最初の tick
  if (rule.schedule === "weekly") return jstDow === 1 && jstHour >= 6; // 月曜
  return true;
}

function fill(t: string, count: number): string {
  return t.replace(/\{count\}/g, String(count));
}

/**
 * ルールの Act（Detect→Explain→Recommend→**Act**・#294）。
 * gn_rules.action_tool が入っているルールが発火したら呼ぶ。実行は Core（executeTool）を通すので、
 * risk>=2 の Tool は AI Actor の Policy で承認待ちになり、Inbox に「承認カード」として出る（勝手に送らない）。
 * 戻り値の status / queuedId を提案の body に添える。
 */
export type RuleAct = (args: { companyId: string; rule: Row; count: number; tool: string; input: Record<string, unknown>; dedupeKey: string }) => Promise<{ status: string; queuedId?: string | null; error?: string | null }>;

/** action_input の {count} / {date} を埋める（文字列の値だけ） */
export function fillInput(input: unknown, vars: Record<string, string | number>): Record<string, unknown> {
  const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Row) : {};
  const out: Row = {};
  for (const [k, v] of Object.entries(src)) out[k] = typeof v === "string" ? v.replace(/\{(\w+)\}/g, (_, n) => (n in vars ? String(vars[n]) : `{${n}}`)) : v;
  return out;
}

export async function evaluateRules(admin: AdminLike, companyId: string, now = new Date(), act?: RuleAct): Promise<{ evaluated: number; fired: Array<{ code: string; count: number; act?: string }>; errors: Array<{ code: string; error: string }> }> {
  const { data } = await admin.from("gn_rules").select("*").eq("company_id", companyId).eq("enabled", true);
  const rules = (data ?? []) as Row[];
  const fired: Array<{ code: string; count: number; act?: string }> = [];
  const errors: Array<{ code: string; error: string }> = [];
  let evaluated = 0;
  for (const r of rules) {
    if (!due(r, now)) continue;
    evaluated += 1;
    const code = String(r.code);
    try {
      const { data: rows, error } = await admin.rpc("gn_chat_query", { p_sql: String(r.condition_sql), p_company_id: companyId, p_scope: "hq", p_store_id: null, p_limit: 50 });
      if (error) throw new Error(error.message);
      const list = (Array.isArray(rows) ? rows : []) as Row[];
      // 「count(*) ... having」型は1行に件数が入る
      const count = list.length === 1 && typeof list[0].bookings === "number" ? Number(list[0].bookings) : list.length === 1 && typeof list[0].count === "number" ? Number(list[0].count) : list.length;
      await admin.from("gn_rules").update({ last_fired_at: now.toISOString(), last_count: count, last_error: null, updated_at: now.toISOString() }).eq("id", r.id);
      if (count <= 0) continue;
      const title = fill(String(r.title_template), count);
      const dedupe = `rule:${code}:${now.toISOString().slice(0, 10)}`;
      // Act: action_tool があれば Core を通して実行（承認が要れば承認キューに積まれる）。失敗しても提案は出す
      let actNote = "";
      let actStatus: string | undefined;
      if (act && typeof r.action_tool === "string" && r.action_tool.trim()) {
        try {
          const input = fillInput(r.action_input, { count, date: now.toISOString().slice(0, 10), title });
          const a = await act({ companyId, rule: r, count, tool: r.action_tool.trim(), input, dedupeKey: dedupe });
          actStatus = a.status;
          actNote = a.status === "needs_approval" ? `\n\n▶ ${r.action_tool} を承認待ちに積みました（判断フィードで承認すると実行）` : a.status === "ok" || a.status === "idempotent" ? `\n\n▶ ${r.action_tool} を実行しました` : `\n\n▶ ${r.action_tool}: ${a.status}${a.error ? " — " + a.error : ""}`;
        } catch (e) {
          actStatus = "failed";
          actNote = `\n\n▶ ${r.action_tool} の実行に失敗: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      const body = [fill(String(r.body_template ?? ""), count), "", "根拠（先頭5件）:", ...list.slice(0, 5).map((x) => "・" + Object.values(x).map((v) => (v == null ? "" : String(v))).join(" / "))].join("\n") + actNote;
      const { error: insErr } = await admin.from("ai_suggestions").insert({
        company_id: companyId,
        kind: "proactive",
        severity: String(r.severity ?? "warning"),
        title,
        body,
        suggested_action: r.suggested_action ?? null,
        approval_status: "pending",
        execution_status: "not_executed",
        source: `rule:${code}`,
        dedupe_key: dedupe,
        href: r.href ?? null,
        impact: null,
        effort: "すぐ",
      });
      if (insErr && insErr.code !== "23505") throw new Error(insErr.message);
      await admin.rpc("gn_emit", { p_company_id: companyId, p_store_id: null, p_type: "rule.fired", p_version: 1, p_entity_kind: "rule", p_entity_id: code, p_payload: { code, count, title, summary: title }, p_source: "scheduler:rules" }).catch(() => null);
      fired.push(actStatus ? { code, count, act: actStatus } : { code, count });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      errors.push({ code, error });
      await admin.from("gn_rules").update({ last_error: error, updated_at: now.toISOString() }).eq("id", r.id);
    }
  }
  return { evaluated, fired, errors };
}

/* ---------- Waiting For ---------- */
export async function nudgeWaiting(admin: AdminLike, companyId: string, now = new Date()): Promise<{ nudged: number }> {
  const { data } = await admin.from("gn_waiting").select("*").eq("company_id", companyId).eq("status", "open").lte("expected_by", now.toISOString()).limit(50);
  let nudged = 0;
  for (const w of (data ?? []) as Row[]) {
    const last = w.nudged_at ? Date.parse(String(w.nudged_at)) : 0;
    if (now.getTime() - last < 24 * 3600_000) continue;
    const label = String(w.entity_label ?? "");
    const title = `${label ? label + "の" : ""}${w.what}を待って${daysSince(String(w.since), now)}日です。そろそろフォローしますか？`;
    const { error } = await admin.from("ai_suggestions").insert({
      company_id: companyId, kind: "waiting", severity: "info", title,
      body: `待ち始め: ${String(w.since).slice(0, 10)} / 期限: ${String(w.expected_by).slice(0, 10)}${w.followup_note ? "\n" + w.followup_note : ""}`,
      suggested_action: "フォローする", approval_status: "pending", execution_status: "not_executed", source: "waiting", dedupe_key: `waiting:${w.id}:${now.toISOString().slice(0, 10)}`, href: "/inbox", effort: "すぐ",
    });
    if (error && error.code !== "23505") continue;
    await admin.from("gn_waiting").update({ nudged_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", w.id);
    nudged += 1;
  }
  return { nudged };
}

function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000));
}

/** cron:execute（10分ごと）から呼ぶ1本 */
export async function runSchedulerTick(admin: AdminLike, companyId: string, opts: { act?: RuleAct } = {}): Promise<Row> {
  const events = await withJobRun(admin, "events:process", companyId, () => processEvents(admin, companyId));
  const rules = await withJobRun(admin, "rules:evaluate", companyId, () => evaluateRules(admin, companyId, new Date(), opts.act));
  const waiting = await withJobRun(admin, "waiting:nudge", companyId, () => nudgeWaiting(admin, companyId));
  return { events, rules, waiting };
}
