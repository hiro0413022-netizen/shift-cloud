/**
 * Memory の Tool（#299）。「覚えておいて」「〇〇さんは午後希望」を gn_memories に。
 *   memory.remember … 書く（人が言えば 1.0、AI が推定したら 0.6）
 *   memory.list     … いま効いている記憶
 *   memory.confirm  … AI の推定を人が確認して 1.0 に
 *   memory.forget   … 消す（soft delete・取り消し可）
 */
import { defineTool, type ToolContract } from "../tool.ts";
import type { JsonSchema } from "../schema.ts";
import { effectiveActor } from "../context.ts";
import { MEMORY_SCOPES, loadMemory, memoryKey } from "../memory.ts";
import { src } from "./_shared.ts";

const scopeEnum: JsonSchema = { type: "string", enum: [...MEMORY_SCOPES], default: "company", description: "user=本人の好み / company=会社のルール / store=店舗 / customer=お客様 / project=案件" };

export const memoryRemember = defineTool({
  name: "memory.remember",
  version: 1,
  domain: "ops",
  description: "覚えておく（Memory に1行）。「覚えておいて」「今後は〜にして」「〇〇さんは午後希望」はこれ。scope は会社のルールなら company、店の事情なら store、お客様なら customer",
  input: {
    type: "object",
    required: ["value"],
    properties: {
      value: { type: "string", minLength: 2, maxLength: 400, description: "覚える内容（人が読める1文）" },
      scope: scopeEnum,
      scope_id: { type: "string", description: "store=店舗ID / customer=電話か会員番号 / project=案件ID。user は省略（本人）" },
      key: { type: "string", maxLength: 80, description: "省略可。'booking.lefty_bay' のような英字キー" },
      inferred: { type: "boolean", default: false, description: "AI の推定なら true（confidence 0.6・人が確認するまで「推定」扱い）" },
      expires_in_days: { type: "integer", minimum: 1, maximum: 365, description: "期限つきの記憶（「今月は〜」）" },
    },
  },
  output: { type: "object", required: ["memory_id", "key", "confidence"], properties: { memory_id: { type: "string" }, key: { type: "string" }, confidence: { type: "number" }, replaced: { type: "boolean" } } },
  permission: [],
  scope: "company",
  risk: 1,
  // 同じ内容の2回目は実行しない。同じ key に別の値は「上書き」として実行する
  idempotency: (i, ctx) => `${ctx.company.id}:${i.scope ?? "company"}:${i.scope_id ?? ""}:${i.key ?? ""}:${memoryKey(String(i.value))}`,
  rateLimit: { perMinute: 20 },
  emits: [],
  renders: "EntityCard",
  impl: async (input, ctx) => {
    const a = effectiveActor(ctx.context.actor);
    const scope = String(input.scope ?? "company");
    const scopeId = scope === "user" ? a.staffId : input.scope_id ? String(input.scope_id) : scope === "store" ? (ctx.context.store?.id ?? a.primaryStoreId) : null;
    if (scope === "customer" && !scopeId) throw new Error("customer の記憶には scope_id（電話か会員番号）が要ります");
    if (scope === "project" && !scopeId) throw new Error("project の記憶には scope_id が要ります");
    const key = input.key ? memoryKey(String(input.key)) : memoryKey(String(input.value));
    const human = ctx.context.actor.kind === "human" || !!ctx.context.actor.onBehalfOf;
    const confidence = input.inferred ? 0.6 : human ? 1 : 0.6;
    const now = new Date().toISOString();
    const row = {
      company_id: ctx.context.company.id, scope, scope_id: scopeId, key, value: String(input.value),
      source: ctx.context.surface === "cron" ? "rule" : "jarvis", confidence,
      stated_by: human ? a.staffId : null, verified_at: confidence >= 1 ? now : null,
      expires_at: input.expires_in_days ? new Date(Date.now() + Number(input.expires_in_days) * 86_400_000).toISOString() : null,
      updated_at: now,
    };
    // 同じ key があれば上書き（記憶は最新が正）
    let q = ctx.admin.from("gn_memories").select("id").eq("company_id", row.company_id).eq("scope", scope).eq("key", key).is("deleted_at", null);
    q = scopeId == null ? q.is("scope_id", null) : q.eq("scope_id", scopeId);
    const { data: prev } = await q.maybeSingle();
    if (prev?.id) {
      const { error } = await ctx.admin.from("gn_memories").update(row).eq("id", prev.id);
      if (error) throw new Error(error.message);
      return { data: { memory_id: String(prev.id), key, confidence, replaced: true }, sources: [src("gn_memories")] };
    }
    const { data, error } = await ctx.admin.from("gn_memories").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { data: { memory_id: String(data.id), key, confidence, replaced: false }, sources: [src("gn_memories")] };
  },
});

export const memoryList = defineTool({
  name: "memory.list",
  version: 1,
  domain: "ops",
  description: "いま効いている記憶（会社・店舗・本人・このお客様）。「何を覚えてる？」はこれ",
  input: { type: "object", properties: { scope: { type: "string", enum: [...MEMORY_SCOPES] }, customer_id: { type: "string" } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    const list = await loadMemory(ctx.admin, ctx.context, { customerId: input.customer_id ? String(input.customer_id) : null, limit: 200 });
    const rows = list.filter((m) => !input.scope || m.scope === input.scope).map((m) => ({ 範囲: m.scope, 対象: m.scopeId ?? "", 内容: m.value, 確度: m.confidence >= 1 ? "確認済み" : `推定 ${Math.round(m.confidence * 100)}%`, 出どころ: m.source ?? "", key: m.key, id: m.id }));
    return { data: { rows, count: rows.length }, sources: [src("gn_memories")], kind: "fact", rowCount: rows.length };
  },
});

export const memoryConfirm = defineTool({
  name: "memory.confirm",
  version: 1,
  domain: "ops",
  description: "AI が推定した記憶を人が確認して確定（confidence 1.0）にする",
  input: { type: "object", required: ["memory_id"], properties: { memory_id: { type: "string", format: "uuid" } } },
  output: { type: "object", required: ["memory_id"], properties: { memory_id: { type: "string" }, confirmed: { type: "boolean" } } },
  permission: [],
  scope: "company",
  risk: 1,
  idempotency: (i) => `confirm:${i.memory_id}`,
  rateLimit: { perMinute: 30 },
  emits: [],
  renders: "EntityCard",
  impl: async (input, ctx) => {
    if (ctx.context.actor.kind !== "human" && !ctx.context.actor.onBehalfOf) throw new Error("記憶の確認は人だけができます（AI は自分の推定を確定できない）");
    const a = effectiveActor(ctx.context.actor);
    const { data, error } = await ctx.admin.from("gn_memories").update({ confidence: 1, verified_at: new Date().toISOString(), stated_by: a.staffId, updated_at: new Date().toISOString() }).eq("id", String(input.memory_id)).eq("company_id", ctx.context.company.id).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("記憶が見つかりません");
    return { data: { memory_id: String(data.id), confirmed: true }, sources: [src("gn_memories")] };
  },
});

export const memoryForget = defineTool({
  name: "memory.forget",
  version: 1,
  domain: "ops",
  description: "記憶を消す（「それは忘れて」）。soft delete なので undo で戻せる",
  input: { type: "object", required: ["memory_id"], properties: { memory_id: { type: "string", format: "uuid" } } },
  output: { type: "object", required: ["memory_id"], properties: { memory_id: { type: "string" }, forgotten: { type: "boolean" } } },
  permission: [],
  scope: "company",
  risk: 1, // soft delete＝戻せるので即実行。undo / verify は付けておく
  idempotency: (i) => `forget:${i.memory_id}`,
  rateLimit: { perMinute: 30 },
  emits: [],
  renders: "EntityCard",
  undo: async (out, ctx) => {
    await ctx.admin.from("gn_memories").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", String(out.memory_id));
  },
  verify: async (out, ctx) => {
    const { data } = await ctx.admin.from("gn_memories").select("deleted_at").eq("id", String(out.memory_id)).maybeSingle();
    return !!data?.deleted_at;
  },
  impl: async (input, ctx) => {
    const { data, error } = await ctx.admin.from("gn_memories").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", String(input.memory_id)).eq("company_id", ctx.context.company.id).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("記憶が見つかりません（既に消えています）");
    return { data: { memory_id: String(data.id), forgotten: true }, sources: [src("gn_memories")] };
  },
});

export const MEMORY_TOOLS: ToolContract[] = [memoryRemember, memoryList, memoryConfirm, memoryForget] as unknown as ToolContract[];
