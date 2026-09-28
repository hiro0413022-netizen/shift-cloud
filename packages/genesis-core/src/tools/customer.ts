/**
 * Customer ドメインの Tool（顧客: 検索・カード・履歴・体験・会員数）
 *
 * customer.search は member-os /search と同じ DB 関数 search_visitors（#130）を使う。
 * 名寄せ（visitor-search-pure.mergePeople）は P1 で Person Entity の正典として core へ移す。
 * P0 は横断ヒットをそのまま返す（入口を Genesis に作ることが目的）。
 */
import { defineTool, type ToolContract } from "../tool.ts";
import { viewQuery, lit, src, rows, monthRange, isYmd } from "./_shared.ts";
import { effectiveActor, visibleStoreIds } from "../context.ts";

export const customerSearch = defineTool({
  name: "customer.search",
  version: 1,
  domain: "customer",
  description: "お名前・電話・会員番号で顧客を横断検索（GOLF WING 会員・FRANK 会員・受付台帳・体験・問い合わせ）",
  input: { type: "object", required: ["q"], properties: { q: { type: "string", minLength: 1, maxLength: 60 }, limit: { type: "integer", minimum: 1, maximum: 60, default: 20 } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" }, q: { type: "string" } } },
  permission: ["use_reception", "view_hq"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    const a = effectiveActor(ctx.context.actor);
    const storeIds = visibleStoreIds(ctx.context);
    const { data, error } = await ctx.admin.rpc("search_visitors", {
      p_company_id: ctx.context.company.id,
      p_q: String(input.q),
      p_store_ids: a.isOwner ? null : storeIds,
      p_include_gw: true,
      p_limit: Number(input.limit ?? 20),
    });
    if (error) throw new Error(`search_visitors 失敗: ${error.message}`);
    const hits = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    const slim = hits.map((h) => ({ kind: h.kind, id: h.id, name: h.name, phone: h.phone, member_no: h.member_no ?? null, member_type: h.member_type ?? h.plan ?? null, store: h.store ?? null, status: h.status ?? null, visit_count: h.visit_count ?? null, last_visit: (h as { last_visit?: unknown }).last_visit ?? null }));
    return rows(slim, "search_visitors", { data: { q: String(input.q) } });
  },
});

export const customerCard = defineTool({
  name: "customer.card",
  version: 1,
  domain: "customer",
  description: "FRANK 会員1名のカード（会員番号で引く）。GOLF WING 会員は gnv_members から",
  input: { type: "object", required: ["member_no"], properties: { member_no: { type: "string" } } },
  output: { type: "object", required: ["found"], properties: { found: { type: "boolean" }, member: { type: "object", nullable: true }, store: { type: "string", nullable: true } } },
  permission: ["use_reception", "view_hq"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "EntityCard",
  impl: async (input, ctx) => {
    const no = String(input.member_no).trim();
    const frank = await viewQuery(ctx.admin, ctx.context, `select member_no, member_name, plan_name, status_label, join_date, start_date, leave_date, payment_method, billing_status, gender, age, company_name from gnv_frank_members where member_no = ${lit(no)}`, 1);
    if (frank.length) return { data: { found: true, member: frank[0], store: "FRANK GOLF" }, sources: [src("gnv_frank_members")], kind: "fact", rowCount: 1 };
    const gw = await viewQuery(ctx.admin, ctx.context, `select member_no, member_name, member_type, class_name, join_date, leave_date, leave_reason, monthly_visits, last_visit_date, is_active from gnv_members where member_no = ${lit(no)}`, 1);
    if (gw.length) return { data: { found: true, member: gw[0], store: "GOLF WING" }, sources: [src("gnv_members")], kind: "fact", rowCount: 1 };
    return { data: { found: false, member: null, store: null }, sources: [src("gnv_frank_members"), src("gnv_members")], kind: "fact", rowCount: 0 };
  },
});

export const customerTimeline = defineTool({
  name: "customer.timeline",
  version: 1,
  domain: "customer",
  description: "お名前で予約・来店・イベントの履歴を時系列に（Universal Timeline の P0 版）",
  input: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 100, default: 30 } } },
  output: { type: "object", required: ["items", "count"], properties: { items: { type: "array" }, count: { type: "integer" }, entity: { type: "string" } } },
  permission: ["use_reception", "view_hq"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Timeline",
  impl: async (input, ctx) => {
    const name = String(input.name).trim();
    const like = lit(`%${name}%`);
    const limit = Number(input.limit ?? 30);
    const [bk, wk] = await Promise.all([
      viewQuery(ctx.admin, ctx.context, `select booked_date as at, 'reservation' as kind, concat(start_time, ' ', bay_name, ' ', status) as summary from gnv_bookings where customer_name like ${like} order by booked_date desc limit ${limit}`, limit),
      viewQuery(ctx.admin, ctx.context, `select visited_on as at, case when visit_type = 'trial' then 'trial' else 'visit' end as kind, concat(visit_type, coalesce(' → ' || result, '')) as summary from gnv_walkins where guest_name like ${like} order by visited_on desc limit ${limit}`, limit),
    ]);
    let ev: Array<Record<string, unknown>> = [];
    try {
      const { data } = await ctx.admin.from("gn_events").select("occurred_at, type, payload").eq("company_id", ctx.context.company.id).ilike("payload->>summary", `%${name}%`).order("occurred_at", { ascending: false }).limit(limit);
      ev = ((data ?? []) as Array<Record<string, unknown>>).map((e) => ({ at: String(e.occurred_at).slice(0, 10), kind: e.type, summary: (e.payload as Record<string, unknown>)?.summary ?? e.type }));
    } catch {
      /* gn_events 未適用 */
    }
    const items = [...bk, ...wk, ...ev].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
    return { data: { items, count: items.length, entity: `person:${name}` }, sources: [src("gnv_bookings"), src("gnv_walkins"), src("gn_events")], kind: "fact", rowCount: items.length };
  },
});

export const trialList = defineTool({
  name: "trial.list",
  version: 1,
  domain: "customer",
  description: "期間の体験（受付台帳 visit_type='trial'）と入会結果。正典は mbr_walkin_visits（mbr_trial_bookings は空）",
  input: { type: "object", properties: { from: { type: "string", format: "date" }, to: { type: "string", format: "date" } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" }, joined: { type: "integer" } } },
  permission: ["use_reception", "view_hq"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    const m = monthRange(ctx.context.time.jstDate);
    const from = isYmd(input.from) ? input.from : m.from;
    const to = isYmd(input.to) ? input.to : m.to;
    const data = await viewQuery(ctx.admin, ctx.context, `select visited_on, guest_name, store_name, result, referral_source, follow_up_at from gnv_walkins where visit_type = 'trial' and visited_on >= ${lit(from)} and visited_on < ${lit(to)} order by visited_on desc`);
    const joined = data.filter((r) => r.result === "join").length;
    return rows(data, "gnv_walkins", { data: { joined, from, to } });
  },
});

export const membersCount = defineTool({
  name: "members.count",
  version: 1,
  domain: "customer",
  description: "在籍会員数（FRANK は status='active'、GOLF WING は is_active）。店舗別",
  input: { type: "object", properties: {} },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Summary",
  minRows: 1,
  impl: async (_input, ctx) => {
    const data = await viewQuery(
      ctx.admin,
      ctx.context,
      `select 'FRANK GOLF' as store, count(*) as members from gnv_frank_members where status = 'active' and plan_type <> 'テスト' union all select 'GOLF WING' as store, count(*) as members from gnv_members where is_active`
    );
    return rows(data, "gnv_frank_members / gnv_members");
  },
});

export const CUSTOMER_TOOLS: ToolContract[] = [customerSearch, customerCard, customerTimeline, trialList, membersCount] as unknown as ToolContract[];
