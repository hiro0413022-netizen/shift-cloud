/**
 * Dev ドメインの Tool（Genesis 自身の監視と開発依頼）。
 * devreq.create は JARVIS の intent=dev（#182）と同じ表 gn_dev_requests に積む。
 * 本番デプロイ（prod_deploy）は Tool にしない: 既存 ai-execution の approval ハンドラのまま（人の承認が最後の安全弁）。
 */
import { defineTool, type ToolContract } from "../tool.ts";
import { src } from "./_shared.ts";
import { effectiveActor } from "../context.ts";

export const healthCheck = defineTool({
  name: "health.check",
  version: 1,
  domain: "dev",
  description: "Genesis 内部の健全性: 止まっている実行キュー・失敗した Tool・黙って0件・未処理イベント",
  input: { type: "object", properties: { hours: { type: "integer", minimum: 1, maximum: 168, default: 24 } } },
  output: { type: "object", required: ["items", "ok"], properties: { items: { type: "array" }, ok: { type: "boolean" } } },
  permission: ["view_hq"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 30 },
  emits: [],
  renders: "Health",
  impl: async (input, ctx) => {
    const { admin } = ctx;
    const companyId = ctx.context.company.id;
    const since = new Date(Date.now() - Number(input.hours ?? 24) * 3600_000).toISOString();
    const count = async (table: string, f: (q: unknown) => unknown) => {
      try {
        const q = admin.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId);
        const { count } = await (f(q) as Promise<{ count: number | null }>);
        return count ?? 0;
      } catch {
        return -1;
      }
    };
    const items = [
      { key: "queue_stuck", label: "実行キューで10分以上 running", value: await count("ai_action_queue", (q) => (q as { eq: Function }).eq("status", "running")) },
      { key: "queue_failed", label: "実行キューの失敗", value: await count("ai_action_queue", (q) => (q as { eq: Function; gte: Function }).eq("status", "failed").gte("created_at", since)) },
      { key: "tool_failed", label: "Tool の失敗（failed / verify_failed）", value: await count("gn_tool_executions", (q) => (q as { in: Function; gte: Function }).in("status", ["failed", "verify_failed"]).gte("created_at", since)) },
      { key: "silent_zero", label: "黙って0件", value: await count("gn_tool_executions", (q) => (q as { eq: Function; gte: Function }).eq("silent_zero", true).gte("created_at", since)) },
      { key: "events_unprocessed", label: "未処理イベント", value: await count("gn_events", (q) => (q as { is: Function }).is("processed_at", null)) },
      { key: "denied", label: "権限拒否", value: await count("gn_tool_executions", (q) => (q as { eq: Function; gte: Function }).eq("status", "denied").gte("created_at", since)) },
    ];
    // cron が動いているか（gn_job_runs）: 直近 30 分に cron:execute が無ければ止まっている
    let cronAgeMin = -1;
    try {
      const { data: last } = await admin.from("gn_job_runs").select("started_at").eq("job", "cron:execute").order("started_at", { ascending: false }).limit(1).maybeSingle();
      cronAgeMin = last?.started_at ? Math.round((Date.now() - Date.parse(String(last.started_at))) / 60_000) : 9999;
    } catch {
      /* 未適用 */
    }
    items.push({ key: "cron_stale", label: "cron:execute が最後に走ってからの分数（30分超で異常）", value: cronAgeMin > 30 ? cronAgeMin : 0 });
    const ok = items.every((i) => i.value <= 0 || i.key === "events_unprocessed" || i.key === "denied");
    return { data: { items, ok }, sources: [src("ai_action_queue"), src("gn_tool_executions"), src("gn_events")], kind: "fact", rowCount: items.length };
  },
});

export const devreqCreate = defineTool({
  name: "devreq.create",
  version: 1,
  domain: "dev",
  description: "開発依頼を積む（gn_dev_requests）。said（原文）は丸めない",
  input: { type: "object", required: ["title", "said"], properties: { title: { type: "string", minLength: 1, maxLength: 120 }, said: { type: "string", minLength: 1 }, spec: { type: "string" }, app_hint: { type: "string" }, priority: { type: "string", enum: ["urgent", "normal", "low"], default: "normal" }, source: { type: "string", enum: ["jarvis", "command", "suggestion", "incident", "manual"], default: "command" } } },
  output: { type: "object", required: ["request_id", "title"], properties: { request_id: { type: "string" }, title: { type: "string" } } },
  permission: ["view_hq"],
  scope: "company",
  risk: 1,
  idempotency: (i, ctx) => `${ctx.company.id}:${i.title}:${ctx.time.jstDate}`,
  rateLimit: { perMinute: 10 },
  emits: ["devreq.created@1"],
  renders: "EntityCard",
  impl: async (input, ctx) => {
    const a = effectiveActor(ctx.context.actor);
    const { data, error } = await ctx.admin
      .from("gn_dev_requests")
      .insert({
        company_id: ctx.context.company.id,
        requested_by: a.staffId,
        source: String(input.source ?? "command"),
        title: String(input.title),
        said: String(input.said),
        spec: String(input.spec ?? `【依頼】${input.said}\n（Tool devreq.create 経由・仕様はCowork側で起こす）`),
        app_hint: input.app_hint ? String(input.app_hint) : null,
        priority: String(input.priority ?? "normal"),
        status: "queued",
      })
      .select("id, title")
      .single();
    if (error) throw new Error(error.message);
    const out = { request_id: String(data.id), title: String(data.title) };
    await ctx.emit("devreq.created", 1, { ...out, summary: `開発依頼: ${out.title}` }, { kind: "devreq", id: out.request_id });
    return { data: out, sources: [src("gn_dev_requests")] };
  },
});

export const DEV_TOOLS: ToolContract[] = [healthCheck, devreqCreate] as unknown as ToolContract[];
