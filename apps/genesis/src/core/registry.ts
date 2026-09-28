import "server-only";
import { createGenesisCore } from "@yozan/genesis-core/tools/all";
import { defineTool, type ToolContract } from "@yozan/genesis-core/tool";

/* ============================================================
   Genesis の Tool Registry（Final Architecture §2）
   Core の 22 本 ＋ Genesis 固有の Tool。プロセスで1つ（globalThis に保持・HMR 対策）。
   ============================================================ */

/** 社内スタッフへの公式LINE（#59/#85/#198 の sendStaffLine をラップ）。お客様宛は Tool にしない（承認カードのまま） */
const messageSend = defineTool({
  name: "message.send",
  version: 1,
  domain: "customer",
  description: "社内スタッフの公式LINEグループへ送る（audience は staff のみ。お客様宛は不可）。営業時間外・MCP 経由は承認",
  input: {
    type: "object",
    required: ["body"],
    properties: {
      body: { type: "string", minLength: 1, maxLength: 1000 },
      audience: { type: "string", enum: ["staff"], default: "staff" },
      store_id: { type: "string", format: "uuid", description: "店舗のグループへ。無指定は既定グループ" },
      target: { type: "string", enum: ["all"], description: "all=全グループ" },
      group_id: { type: "string" },
    },
  },
  output: { type: "object", required: ["sent"], properties: { sent: { type: "integer" }, groups: { type: "array" } } },
  permission: ["view_hq", "manage_shifts"],
  scope: "company",
  risk: 3,
  idempotency: (i, ctx) => `${ctx.company.id}:${ctx.time.jstDate}:${i.store_id ?? i.group_id ?? i.target ?? "default"}:${String(i.body).slice(0, 80)}`,
  rateLimit: { perMinute: 5 },
  emits: ["message.sent@1"],
  renders: "MessageDraft",
  undo: async () => {
    throw new Error("送信は取り消せません（承認で防ぐ・Level 3）");
  },
  verify: async (out) => Number(out.sent ?? 0) > 0,
  impl: async (input, ctx) => {
    const { sendStaffLine } = await import("@/lib/ai-execution");
    const r = await sendStaffLine(ctx.admin, {
      id: "core",
      company_id: ctx.context.company.id,
      action_type: "staff_directive",
      mode: "auto",
      title: "message.send",
      payload: { body: input.body, store_id: input.store_id ?? null, target: input.target ?? null, group_id: input.group_id ?? null },
      status: "running",
      scheduled_at: new Date().toISOString(),
      undo_deadline: null,
      executed_at: null,
      cancelled_at: null,
      error: null,
      result: null,
      origin_kind: "core",
      origin_id: null,
      created_by: ctx.context.actor.staffId,
      created_at: new Date().toISOString(),
    });
    const groups = ((r as { groups?: unknown[] }).groups ?? []) as unknown[];
    const sent = groups.length;
    await ctx.emit("message.sent", 1, { audience: "staff", target: String(input.store_id ?? input.group_id ?? input.target ?? "default"), chars: String(input.body).length, summary: `スタッフLINE送信: ${String(input.body).slice(0, 40)}` });
    return { data: { sent, groups } };
  },
});

const APP_TOOLS: ToolContract[] = [messageSend as unknown as ToolContract];

type Core = ReturnType<typeof createGenesisCore>;
const g = globalThis as unknown as { __genesisCore?: Core };

export function getCore(): Core {
  if (!g.__genesisCore) g.__genesisCore = createGenesisCore({ tools: APP_TOOLS });
  return g.__genesisCore;
}
