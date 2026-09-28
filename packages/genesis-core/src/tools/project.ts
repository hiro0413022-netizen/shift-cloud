/**
 * Projects の Tool（#303）。案件 = Memory（project スコープ）・Waiting・開発依頼・判断・イベントの束。
 *   project.list   … 案件一覧
 *   project.card   … 1件のカード（目的・期限・記憶・紐づくもの・最近の動き）
 *   project.create … 案件を作る（risk 1）
 *   project.link   … 案件に「もの」を紐づける（メモ・URL・待ち・開発依頼 …・risk 1）
 */
import { defineTool, type ToolContract } from "../tool.ts";
import { effectiveActor } from "../context.ts";
import { src } from "./_shared.ts";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? "" : String(v));

async function findProject(admin: import("../tool.ts").AdminLike, companyId: string, q: string): Promise<Row | null> {
  const { data } = await admin.from("gn_projects").select("*").eq("company_id", companyId).is("deleted_at", null).limit(50);
  const list = ((data ?? []) as Row[]);
  const t = q.trim().toLowerCase();
  return list.find((p) => s(p.id) === t || s(p.slug) === t) ?? list.find((p) => s(p.name).toLowerCase().includes(t)) ?? null;
}

export const projectList = defineTool({
  name: "project.list",
  version: 1,
  domain: "ops",
  description: "案件（プロジェクト）の一覧: 名前・目的・状態・期限・紐づくものの数。「案件は？」「進めているものは？」はこれ",
  input: { type: "object", properties: { status: { type: "string", enum: ["active", "paused", "done", "cancelled"] } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    let q = ctx.admin.from("gn_projects").select("id, name, slug, goal, status, due_on, updated_at").eq("company_id", ctx.context.company.id).is("deleted_at", null).order("updated_at", { ascending: false }).limit(100);
    if (input.status) q = q.eq("status", String(input.status));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const list = (data ?? []) as Row[];
    const counts: Record<string, number> = {};
    if (list.length) {
      const { data: items } = await ctx.admin.from("gn_project_items").select("project_id").eq("company_id", ctx.context.company.id).is("deleted_at", null).in("project_id", list.map((p) => s(p.id)));
      for (const it of (items ?? []) as Row[]) counts[s(it.project_id)] = (counts[s(it.project_id)] ?? 0) + 1;
    }
    const rows = list.map((p) => ({ 案件: p.name, 目的: p.goal ?? "", 状態: p.status, 期限: p.due_on ?? "", 紐づき: counts[s(p.id)] ?? 0, slug: p.slug, id: p.id }));
    return { data: { rows, count: rows.length }, sources: [src("gn_projects")], kind: "fact", rowCount: rows.length };
  },
});

export const projectCard = defineTool({
  name: "project.card",
  version: 1,
  domain: "ops",
  description: "案件1件のカード: 目的・状態・期限・この案件の記憶・紐づくもの（待ち・開発依頼・判断・メモ・リンク）・最近の動き。「2号店の状況」「24時間化はどうなってる」はこれ",
  input: { type: "object", required: ["q"], properties: { q: { type: "string", minLength: 1, description: "案件名の一部 / slug / id" } } },
  output: { type: "object", required: ["found"], properties: { found: { type: "boolean" }, project: { type: "object", nullable: true }, memories: { type: "array" }, items: { type: "array" }, waiting: { type: "array" }, timeline: { type: "array" } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "EntityCard",
  impl: async (input, ctx) => {
    const companyId = ctx.context.company.id;
    const p = await findProject(ctx.admin, companyId, String(input.q));
    if (!p) return { data: { found: false, project: null, memories: [], items: [], waiting: [], timeline: [] }, sources: [src("gn_projects")], kind: "fact", rowCount: 0 };
    const pid = s(p.id);
    const [mem, items, ev] = await Promise.all([
      ctx.admin.from("gn_memories").select("id, key, value, confidence, source, created_at").eq("company_id", companyId).eq("scope", "project").eq("scope_id", pid).is("deleted_at", null).order("updated_at", { ascending: false }).limit(50),
      ctx.admin.from("gn_project_items").select("id, kind, ref_id, label, url, created_at").eq("company_id", companyId).eq("project_id", pid).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
      ctx.admin.from("gn_events").select("occurred_at, type, payload").eq("company_id", companyId).ilike("payload->>summary", `%${s(p.name).slice(0, 12)}%`).order("occurred_at", { ascending: false }).limit(20),
    ]);
    const memories = ((mem.data ?? []) as Row[]).map((m) => ({ value: m.value, confidence: Number(m.confidence ?? 1), source: m.source ?? "", at: s(m.created_at).slice(0, 10), id: m.id }));
    const list = ((items.data ?? []) as Row[]).map((i) => ({ kind: i.kind, label: i.label, url: i.url ?? null, ref_id: i.ref_id ?? null, at: s(i.created_at).slice(0, 10), id: i.id }));
    // 紐づく待ち（gn_waiting）は id で引く
    const waitingIds = list.filter((i) => i.kind === "waiting" && i.ref_id).map((i) => s(i.ref_id));
    let waiting: Row[] = [];
    if (waitingIds.length) {
      const { data: w } = await ctx.admin.from("gn_waiting").select("id, entity_label, what, status, expected_by").in("id", waitingIds);
      waiting = ((w ?? []) as Row[]).map((x) => ({ 相手: x.entity_label ?? "", 待ち: x.what, 状態: x.status, 期限: s(x.expected_by).slice(0, 10) }));
    }
    const timeline = [
      ...((ev.data ?? []) as Row[]).map((e) => ({ at: s(e.occurred_at).slice(0, 10), kind: s(e.type), summary: s((e.payload as Row | null)?.summary ?? e.type) })),
      ...list.map((i) => ({ at: i.at, kind: `item:${s(i.kind)}`, summary: s(i.label) })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
    const project = { id: pid, name: p.name, slug: p.slug, goal: p.goal ?? "", status: p.status, due_on: p.due_on ?? null, owner_staff_id: p.owner_staff_id ?? null };
    return { data: { found: true, project, memories, items: list, waiting, timeline }, sources: [src("gn_projects"), src("gn_memories"), src("gn_project_items"), src("gn_events")], kind: "fact", rowCount: list.length + memories.length };
  },
});

export const projectCreate = defineTool({
  name: "project.create",
  version: 1,
  domain: "ops",
  description: "案件を作る（名前・目的・期限）。「〇〇の案件を立てて」はこれ",
  input: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 80 }, goal: { type: "string", maxLength: 400 }, due_on: { type: "string", format: "date" }, slug: { type: "string", pattern: "^[a-z0-9-]+$" } } },
  output: { type: "object", required: ["project_id", "name"], properties: { project_id: { type: "string" }, name: { type: "string" }, slug: { type: "string" } } },
  permission: ["view_hq", "manage_company"],
  scope: "company",
  risk: 1,
  idempotency: (i, ctx) => `${ctx.company.id}:project:${String(i.slug ?? i.name).toLowerCase()}`,
  rateLimit: { perMinute: 10 },
  emits: [],
  renders: "EntityCard",
  impl: async (input, ctx) => {
    const a = effectiveActor(ctx.context.actor);
    const slug = input.slug ? String(input.slug) : `p-${Date.now().toString(36)}`;
    const { data, error } = await ctx.admin.from("gn_projects").insert({ company_id: ctx.context.company.id, name: String(input.name), slug, goal: input.goal ? String(input.goal) : null, due_on: input.due_on ?? null, status: "active", created_by: a.staffId, owner_staff_id: a.staffId }).select("id, name, slug").single();
    if (error) throw new Error(error.message);
    return { data: { project_id: s(data.id), name: s(data.name), slug: s(data.slug) }, sources: [src("gn_projects")] };
  },
});

export const projectLink = defineTool({
  name: "project.link",
  version: 1,
  domain: "ops",
  description: "案件に「もの」を紐づける: メモ（note）・URL（link / document）・待ち（waiting・gn_waiting の id）・開発依頼（devreq）・判断（decision）。「2号店にこのメモを付けて」はこれ",
  input: { type: "object", required: ["project", "kind", "label"], properties: { project: { type: "string", description: "案件名の一部 / slug / id" }, kind: { type: "string", enum: ["waiting", "devreq", "decision", "memory", "event", "note", "link", "document"] }, label: { type: "string", minLength: 1, maxLength: 200 }, ref_id: { type: "string" }, url: { type: "string" } } },
  output: { type: "object", required: ["item_id", "project_id"], properties: { item_id: { type: "string" }, project_id: { type: "string" }, project_name: { type: "string" } } },
  permission: [],
  scope: "company",
  risk: 1,
  idempotency: (i, ctx) => `${ctx.company.id}:plink:${i.project}:${i.kind}:${i.ref_id ?? i.url ?? i.label}`,
  rateLimit: { perMinute: 30 },
  emits: [],
  renders: "EntityCard",
  impl: async (input, ctx) => {
    const a = effectiveActor(ctx.context.actor);
    const p = await findProject(ctx.admin, ctx.context.company.id, String(input.project));
    if (!p) throw new Error(`案件が見つかりません: ${String(input.project)}`);
    const { data, error } = await ctx.admin.from("gn_project_items").insert({ company_id: ctx.context.company.id, project_id: s(p.id), kind: String(input.kind), ref_id: input.ref_id ? String(input.ref_id) : null, label: String(input.label), url: input.url ? String(input.url) : null, created_by: a.staffId }).select("id").single();
    if (error) throw new Error(error.message);
    await ctx.admin.from("gn_projects").update({ updated_at: new Date().toISOString() }).eq("id", s(p.id));
    return { data: { item_id: s(data.id), project_id: s(p.id), project_name: s(p.name) }, sources: [src("gn_project_items")] };
  },
});

export const PROJECT_TOOLS: ToolContract[] = [projectList, projectCard, projectCreate, projectLink] as unknown as ToolContract[];
