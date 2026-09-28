/**
 * Finance ドメインの Tool（売上・PL・経費・KPI）。P0 はすべて読み（risk 0）。
 * 数字は Postgres が計算し、Tool は Source（ビュー名・時刻）を必ず付けて返す。
 */
import { defineTool, type ToolContract } from "../tool.ts";
import { viewQuery, lit, src, rows, monthRange, isYmd, askScope } from "./_shared.ts";
import { effectiveActor } from "../context.ts";

export const salesQuery = defineTool({
  name: "sales.query",
  version: 1,
  domain: "finance",
  description: "日本語の質問を SQL にして gnv_* ビューで答える（Ask Data #56）。数字はDBが計算し、生成SQLと件数を出典として返す",
  input: { type: "object", required: ["question"], properties: { question: { type: "string", minLength: 2, maxLength: 300 } } },
  output: { type: "object", required: ["answer"], properties: { answer: { type: "string" }, sql: { type: "string", nullable: true }, rows: { type: "array" }, row_count: { type: "integer", nullable: true }, error: { type: "string", nullable: true } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 20 },
  emits: [],
  renders: "SourceNote",
  impl: async (input, ctx) => {
    const a = effectiveActor(ctx.context.actor);
    const { scope, storeId } = askScope(ctx.context);
    const { askData } = await import("@yozan/core/ask-data");
    const r = await askData({ admin: ctx.admin, question: String(input.question), companyId: ctx.context.company.id, staffId: a.staffId ?? "", scope, storeId });
    return {
      data: { answer: r.answer, sql: r.sql ?? null, rows: (r.rows ?? []).slice(0, 50), row_count: r.rowCount ?? null, error: r.error ?? null },
      sources: [src("gnv_* (ask-data)", r.sql ?? undefined, !r.error)],
      kind: "calculated",
      rowCount: r.rowCount ?? null,
    };
  },
});

export const salesDaily = defineTool({
  name: "sales.daily",
  version: 1,
  domain: "finance",
  description: "指定日（既定は昨日）の店頭売上を店舗別・区分別に。前日比つき",
  input: { type: "object", properties: { date: { type: "string", format: "date" } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" }, date: { type: "string" }, total: { type: "number" }, prev_total: { type: "number" } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "KPI",
  impl: async (input, ctx) => {
    const today = ctx.context.time.jstDate;
    const d = isYmd(input.date) ? input.date : new Date(new Date(`${today}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
    const prev = new Date(new Date(`${d}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
    const [cur, pv] = await Promise.all([
      viewQuery(ctx.admin, ctx.context, `select store_name, category, count(*) as txns, sum(amount) as amount from gnv_sales where sold_on = ${lit(d)} group by store_name, category order by store_name, amount desc`),
      viewQuery(ctx.admin, ctx.context, `select sum(amount) as amount from gnv_sales where sold_on = ${lit(prev)}`),
    ]);
    const total = cur.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const prevTotal = Number(pv[0]?.amount ?? 0);
    return rows(cur, "gnv_sales", { data: { date: d, total, prev_total: prevTotal }, kind: "calculated" });
  },
});

export const salesMonth = defineTool({
  name: "sales.month",
  version: 1,
  domain: "finance",
  description: "今月（または指定月）の店舗別売上合計と、月間目標までの残り（gnv_kpi monthly_sales）",
  input: { type: "object", properties: { month: { type: "string", pattern: "^\\d{4}-\\d{2}$", description: "YYYY-MM（省略時は今月）" } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" }, from: { type: "string" }, to: { type: "string" }, total: { type: "number" }, target: { type: "number", nullable: true } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "KPI",
  impl: async (input, ctx) => {
    const base = typeof input.month === "string" && /^\d{4}-\d{2}$/.test(input.month) ? `${input.month}-01` : ctx.context.time.jstDate;
    const { from, to } = monthRange(base);
    const [cur, kpi] = await Promise.all([
      viewQuery(ctx.admin, ctx.context, `select store_name, count(*) as txns, sum(amount) as amount from gnv_sales where sold_on >= ${lit(from)} and sold_on < ${lit(to)} group by store_name order by amount desc`),
      viewQuery(ctx.admin, ctx.context, `select target_value from gnv_kpi where code = 'monthly_sales' limit 1`, 1),
    ]);
    const total = cur.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return rows(cur, "gnv_sales", { data: { from, to, total, target: kpi[0]?.target_value == null ? null : Number(kpi[0].target_value) }, kind: "calculated" });
  },
});

export const plSegment = defineTool({
  name: "pl.segment",
  version: 1,
  domain: "finance",
  description: "月次の事業別収支（gnv_finance）。income / expense を事業ごとに合計",
  input: { type: "object", properties: { month: { type: "string", pattern: "^\\d{4}-\\d{2}$" } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" }, month: { type: "string" } } },
  permission: ["view_hq", "mon_grants"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 30 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    const base = typeof input.month === "string" && /^\d{4}-\d{2}$/.test(input.month) ? `${input.month}-01` : ctx.context.time.jstDate;
    const { from } = monthRange(base);
    const data = await viewQuery(ctx.admin, ctx.context, `select segment_name, category_kind, sum(amount) as amount from gnv_finance where target_month = ${lit(from)} group by segment_name, category_kind order by segment_name, category_kind`);
    return rows(data, "gnv_finance", { data: { month: from.slice(0, 7) }, kind: "calculated" });
  },
});

export const expensesRecent = defineTool({
  name: "expenses.recent",
  version: 1,
  domain: "finance",
  description: "直近N日の経費（gnv_expenses）",
  input: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 90, default: 14 } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" }, total: { type: "number" } } },
  permission: ["view_hq", "mon_grants"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 30 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    const days = Number(input.days ?? 14);
    const from = new Date(new Date(`${ctx.context.time.jstDate}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10);
    const data = await viewQuery(ctx.admin, ctx.context, `select spent_on, item, payee, amount, method, category, segment_name, store_name from gnv_expenses where spent_on >= ${lit(from)} order by spent_on desc, amount desc`);
    const total = data.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return rows(data, "gnv_expenses", { data: { total } });
  },
});

export const kpiSnapshot = defineTool({
  name: "kpi.snapshot",
  version: 1,
  domain: "finance",
  description: "主要KPI（gnv_kpi）の現在値と目標値。Today の5大KPI の出どころ",
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
    const data = await viewQuery(ctx.admin, ctx.context, `select code, name, area, unit, current_value, target_value, period from gnv_kpi order by area, code`);
    return rows(data, "gnv_kpi");
  },
});

export const FINANCE_TOOLS: ToolContract[] = [salesQuery, salesDaily, salesMonth, plSegment, expensesRecent, kpiSnapshot] as unknown as ToolContract[];
