/**
 * Growth ドメインの Tool（営業・広報・問い合わせ）。P0 は読みのみ。
 */
import { defineTool, type ToolContract } from "../tool.ts";
import { viewQuery, lit, rows } from "./_shared.ts";

export const inquiriesOpen = defineTool({
  name: "inquiries.open",
  version: 1,
  domain: "growth",
  description: "未対応の問い合わせ（LINE・メール・フォーム）。優先度順",
  input: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 30 } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" } } },
  permission: ["view_hq"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    const limit = Number(input.limit ?? 30);
    const data = await viewQuery(ctx.admin, ctx.context, `select received_at, source, inquiry_type, priority, from_name, subject, ai_summary from gnv_inquiries where status not in ('done', 'closed', 'ignored') and reply_sent_at is null order by priority desc, received_at desc limit ${limit}`, limit);
    return rows(data, "gnv_inquiries");
  },
});

export const trialsBySource = defineTool({
  name: "trials.by_source",
  version: 1,
  domain: "growth",
  description: "今月の体験の流入元別件数と入会数（集客の効き目）",
  input: { type: "object", properties: { from: { type: "string", format: "date" }, to: { type: "string", format: "date" } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" } } },
  permission: ["view_hq", "use_reception"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    const today = ctx.context.time.jstDate;
    const from = typeof input.from === "string" ? input.from : `${today.slice(0, 7)}-01`;
    const to = typeof input.to === "string" ? input.to : new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10);
    const data = await viewQuery(ctx.admin, ctx.context, `select coalesce(referral_source, '（未記入）') as source, count(*) as trials, sum(case when result = 'join' then 1 else 0 end) as joined from gnv_walkins where visit_type = 'trial' and visited_on >= ${lit(from)} and visited_on < ${lit(to)} group by 1 order by trials desc`);
    return rows(data, "gnv_walkins", { kind: "calculated" });
  },
});

export const GROWTH_TOOLS: ToolContract[] = [inquiriesOpen, trialsBySource] as unknown as ToolContract[];
