/**
 * Waiting For の Tool（P2-a・#292）。「瀬戸口さんの見積待ち」と言えば台帳に入り、期限を過ぎると Inbox に「そろそろフォロー」が出る。
 */
import { defineTool, type ToolContract } from "../tool.ts";
import { src } from "./_shared.ts";
import { effectiveActor } from "../context.ts";

export const waitingCreate = defineTool({
  name: "waiting.create",
  version: 1,
  domain: "ops",
  description: "「〇〇さんの△△待ち」を台帳に登録する。期限（既定3日）を過ぎたら Inbox に「そろそろフォローしますか？」が出る",
  input: { type: "object", required: ["what"], properties: { who: { type: "string", description: "相手（人・会社）" }, what: { type: "string", minLength: 1, description: "何を待っているか（見積の返事・入金・商品到着）" }, days: { type: "integer", minimum: 1, maximum: 90, default: 3 }, note: { type: "string" }, entity_kind: { type: "string", description: "紐づく Entity の種類（inquiry / reservation / person）。Workflow から使う" }, entity_id: { type: "string" } } },
  output: { type: "object", required: ["waiting_id"], properties: { waiting_id: { type: "string" }, expected_by: { type: "string" } } },
  permission: [],
  scope: "company",
  risk: 1,
  idempotency: (i, ctx) => `${ctx.company.id}:${i.who ?? ""}:${i.what}:${ctx.time.jstDate}`,
  rateLimit: { perMinute: 20 },
  emits: [],
  renders: "EntityCard",
  impl: async (input, ctx) => {
    const a = effectiveActor(ctx.context.actor);
    const expected = new Date(Date.now() + Number(input.days ?? 3) * 86_400_000).toISOString();
    const { data, error } = await ctx.admin.from("gn_waiting").insert({ company_id: ctx.context.company.id, entity_kind: input.entity_kind ?? (input.who ? "partner" : null), entity_id: input.entity_id ?? null, entity_label: input.who ?? null, what: String(input.what), expected_by: expected, followup_note: input.note ?? null, created_by: a.staffId, source: ctx.context.surface }).select("id").single();
    if (error) throw new Error(error.message);
    return { data: { waiting_id: String(data.id), expected_by: expected }, sources: [src("gn_waiting")] };
  },
});

export const waitingList = defineTool({
  name: "waiting.list",
  version: 1,
  domain: "ops",
  description: "いま待っているもの一覧（返事待ち・入金待ち・到着待ち）。期限切れが上",
  input: { type: "object", properties: {} },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Table",
  impl: async (_i, ctx) => {
    const { data } = await ctx.admin.from("gn_waiting").select("id, entity_label, what, since, expected_by, followup_note").eq("company_id", ctx.context.company.id).eq("status", "open").order("expected_by", { ascending: true }).limit(100);
    const now = Date.now();
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map((w) => ({ 相手: w.entity_label ?? "", 待ち: w.what, 開始: String(w.since).slice(0, 10), 期限: String(w.expected_by ?? "").slice(0, 10), 状態: w.expected_by && Date.parse(String(w.expected_by)) < now ? "期限切れ" : "待機中", メモ: w.followup_note ?? "", id: w.id }));
    return { data: { rows, count: rows.length }, sources: [src("gn_waiting")], kind: "fact", rowCount: rows.length };
  },
});

export const waitingClose = defineTool({
  name: "waiting.close",
  version: 1,
  domain: "ops",
  description: "待ちを閉じる（返事が来た・入金された）",
  input: { type: "object", required: ["waiting_id"], properties: { waiting_id: { type: "string", format: "uuid" }, reason: { type: "string" } } },
  output: { type: "object", required: ["waiting_id"], properties: { waiting_id: { type: "string" }, closed: { type: "boolean" } } },
  permission: [],
  scope: "company",
  risk: 2,
  idempotency: (i) => `close:${i.waiting_id}`,
  rateLimit: { perMinute: 20 },
  emits: [],
  renders: "EntityCard",
  undo: async (out, ctx) => {
    await ctx.admin.from("gn_waiting").update({ status: "open", closed_at: null, closed_reason: null }).eq("id", out.waiting_id);
  },
  verify: async (out, ctx) => {
    const { data } = await ctx.admin.from("gn_waiting").select("status").eq("id", out.waiting_id).maybeSingle();
    return data?.status === "done";
  },
  impl: async (input, ctx) => {
    const a = effectiveActor(ctx.context.actor);
    const { error } = await ctx.admin.from("gn_waiting").update({ status: "done", closed_at: new Date().toISOString(), closed_by: a.staffId, closed_reason: String(input.reason ?? "manual") }).eq("id", input.waiting_id).eq("company_id", ctx.context.company.id);
    if (error) throw new Error(error.message);
    return { data: { waiting_id: String(input.waiting_id), closed: true }, sources: [src("gn_waiting")] };
  },
});

export const WAITING_TOOLS: ToolContract[] = [waitingCreate, waitingList, waitingClose] as unknown as ToolContract[];
