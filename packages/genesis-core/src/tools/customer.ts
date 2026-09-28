/**
 * Customer ドメインの Tool（顧客: 検索・カード・履歴・体験・会員数）
 *
 * customer.search は member-os /search と同じ DB 関数 search_visitors（#130）を使う。
 * 名寄せ（visitor-search-pure.mergePeople）は P1 で Person Entity の正典として core へ移す。
 * P0 は横断ヒットをそのまま返す（入口を Genesis に作ることが目的）。
 */
import { defineTool, type ToolContract } from "../tool.ts";
import { viewQuery, lit, src, rows, monthRange, isYmd, addDays } from "./_shared.ts";
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
    const { mergePeople } = await import("@yozan/core/person");
    // 名寄せ（正典 @yozan/core/person・#130 の「別人をくっつけない」鍵）で人単位に
    const people = mergePeople(data);
    const slim = people.map((p) => ({
      name: p.name,
      kana: p.nameKana,
      phone: p.phone,
      kinds: [...new Set(p.hits.map((h) => h.kind))].join("+"),
      member_no: p.hits.find((h) => h.member_no)?.member_no ?? null,
      store: p.hits.find((h) => h.store)?.store ?? null,
      visit_count: p.visitCount,
      last_visit: p.lastVisit,
      alert: p.alertNote,
    }));
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
  input: { type: "object", properties: { from: { type: "string", format: "date", description: "省略時は今月1日" }, to: { type: "string", format: "date", description: "終了日（この日を含む）。省略時は月末" } } },
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
    const to = isYmd(input.to) && input.to >= from ? addDays(input.to, 1) : m.to;
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

export const personCard = defineTool({
  name: "person.card",
  version: 1,
  domain: "customer",
  description: "お名前・電話・会員番号でその人を1枚のカードに（Person Entity）。GOLF WING会員・FRANK会員・受付台帳・体験を名寄せし、来店・予約・出来事の履歴を時系列で添える。「田中さんの履歴」「田中さんについて」はこれ",
  input: { type: "object", required: ["q"], properties: { q: { type: "string", minLength: 1, maxLength: 60, description: "お名前・電話・会員番号" }, pick: { type: "integer", minimum: 1, default: 1, description: "候補が複数のとき何番目か" } } },
  output: { type: "object", required: ["found"], properties: { found: { type: "boolean" }, candidates: { type: "integer" }, person: { type: "object", nullable: true }, timeline: { type: "array" }, others: { type: "array" } } },
  permission: ["use_reception", "view_hq"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "EntityCard",
  impl: async (input, ctx) => {
    const a = effectiveActor(ctx.context.actor);
    const storeIds = visibleStoreIds(ctx.context);
    const { data, error } = await ctx.admin.rpc("search_visitors", { p_company_id: ctx.context.company.id, p_q: String(input.q), p_store_ids: a.isOwner ? null : storeIds, p_include_gw: true, p_limit: 40 });
    if (error) throw new Error(`search_visitors 失敗: ${error.message}`);
    const { mergePeople } = await import("@yozan/core/person");
    const people = mergePeople(data);
    const idx = Math.max(0, Number(input.pick ?? 1) - 1);
    const p = people[idx];
    if (!p) return { data: { found: false, candidates: people.length, person: null, timeline: [], others: [] }, sources: [src("search_visitors")], kind: "fact", rowCount: 0 };
    const kinds = { guest: "受付台帳", member: "GOLF WING会員", frank: "FRANK会員", frank_guest: "FRANKビジター" } as Record<string, string>;
    const person = {
      name: p.name, kana: p.nameKana, phone: p.phone, email: p.email, birth_date: p.birthDate, gender: p.gender,
      sources: p.hits.map((h) => `${kinds[h.kind] ?? h.kind}${h.member_no ? " " + h.member_no : ""}${h.member_type || h.plan ? " " + (h.member_type ?? h.plan) : ""}${h.status ? " " + h.status : ""}`),
      store: p.hits.find((h) => h.store)?.store ?? null,
      visit_count: p.visitCount, first_visit: p.firstVisit, last_visit: p.lastVisit,
      join_date: p.hits.find((h) => h.join_date)?.join_date ?? null,
      leave_date: p.hits.find((h) => h.leave_date)?.leave_date ?? null,
      alert: p.alertNote, note: p.note,
    };
    // 履歴: 来店（名寄せ済み）＋ 打席予約（名前一致）＋ Core のイベント（名前一致）
    const visits = p.visits.map((v) => ({ at: v.date ?? "", kind: v.type === "trial" ? "trial" : "visit", summary: `${v.type ?? ""}${v.store ? " " + v.store : ""}${v.result ? " → " + v.result : ""}${v.pro ? " " + v.pro : ""}` }));
    const like = lit(`%${p.name}%`);
    const [bk, evRes] = await Promise.all([
      viewQuery(ctx.admin, ctx.context, `select booked_date as at, 'reservation' as kind, concat(start_time, ' ', bay_name, ' ', status) as summary from gnv_bookings where customer_name like ${like} order by booked_date desc limit 30`, 30).catch(() => [] as Array<Record<string, unknown>>),
      ctx.admin.from("gn_events").select("occurred_at, type, payload").eq("company_id", ctx.context.company.id).ilike("payload->>summary", `%${p.name}%`).order("occurred_at", { ascending: false }).limit(30),
    ]);
    const ev = (((evRes as { data?: Array<Record<string, unknown>> }).data ?? []) as Array<Record<string, unknown>>).map((e) => ({ at: String(e.occurred_at).slice(0, 10), kind: String(e.type), summary: String((e.payload as Record<string, unknown>)?.summary ?? e.type) }));
    const timeline = [...visits, ...bk, ...ev].filter((t) => t.at).sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 60);
    const others = people.filter((_, i) => i !== idx).slice(0, 5).map((o) => ({ name: o.name, phone: o.phone, last_visit: o.lastVisit }));
    return { data: { found: true, candidates: people.length, person, timeline, others }, sources: [src("search_visitors"), src("gnv_bookings"), src("gn_events")], kind: "fact", rowCount: timeline.length };
  },
});

export const CUSTOMER_TOOLS: ToolContract[] = [customerSearch, customerCard, customerTimeline, personCard, trialList, membersCount] as unknown as ToolContract[];
