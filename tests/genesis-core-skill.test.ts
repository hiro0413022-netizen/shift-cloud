// Genesis P3-a（#294）: Skill ＝ Tool を Plan(DAG) で束ねたもの。
// 線: Skill は権限をまとめて持たない（Step の Tool の Policy がそれぞれ効く）。承認が要る Step は Skill の中で実行しない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../packages/genesis-core/src/execute.ts";
import { ToolRegistry } from "../packages/genesis-core/src/registry.ts";
import { createBlockRegistry } from "../packages/genesis-core/src/blocks.ts";
import { createEventCatalog } from "../packages/genesis-core/src/events.ts";
import { defineTool } from "../packages/genesis-core/src/tool.ts";
import { baseContext, type CoreActor } from "../packages/genesis-core/src/context.ts";
import { defineSkill, skillToTool, runPlan, stepRows } from "../packages/genesis-core/src/skill.ts";
import { blocksFromExecution } from "../packages/genesis-core/src/render.ts";
import { SKILL_TOOLS, morningBriefing, trialFollowup, executiveReport } from "../packages/genesis-core/src/skills/index.ts";
import { createGenesisCore } from "../packages/genesis-core/src/tools/all.ts";
import { newStep } from "../packages/genesis-core/src/plan.ts";
import { createFakeAdmin } from "./fixtures/fake-admin.ts";

const company = { id: "c1", name: "YOZAN", kind: "operating" as const };
const owner: CoreActor = { staffId: "s0", name: "オーナー", kind: "human", isOwner: true, permissions: ["manage_company"], storeIds: ["st1"], primaryStoreId: "st1" };
const staff: CoreActor = { staffId: "s1", name: "受付", kind: "human", isOwner: false, permissions: ["use_reception"], storeIds: ["st1"], primaryStoreId: "st1" };

function setup() {
  const admin = createFakeAdmin();
  const blocks = createBlockRegistry();
  const catalog = createEventCatalog();
  const registry = new ToolRegistry({ blocks });
  const order: string[] = [];
  const mk = (name: string, opts: { permission?: string[]; risk?: 0 | 3; rows?: number; delay?: number } = {}) =>
    defineTool({
      name, version: 1, domain: "ops", description: name, input: { type: "object", properties: { date: { type: "string" } } },
      output: { type: "object", properties: { rows: { type: "array" }, count: { type: "integer" }, date: { type: "string" } } },
      permission: opts.permission ?? [], scope: "company", risk: opts.risk ?? 0, idempotency: () => null, rateLimit: { perMinute: 100 }, emits: [], renders: "Table",
      undo: async () => {}, verify: async () => true,
      impl: async (i) => {
        await new Promise((r) => setTimeout(r, opts.delay ?? 0));
        order.push(name);
        const n = opts.rows ?? 2;
        return { data: { rows: Array.from({ length: n }, (_, k) => ({ k, date: i.date ?? null })), count: n, date: String(i.date ?? "") }, rowCount: n, sources: [{ table: `gnv_${name.replace(".", "_")}` }] };
      },
    });
  registry.register(mk("a.read", { delay: 30 }) as never).register(mk("b.read", { rows: 3 }) as never).register(mk("hq.read", { permission: ["view_hq"] }) as never).register(mk("x.send", { risk: 3 }) as never);
  return { admin, registry, catalog, blocks, order };
}

test("Skill は Tool として登録でき、Step は並列に走り、結果は PlanCard ＋ Step ごとの Block になる", async () => {
  const { admin, registry, catalog, blocks, order } = setup();
  const sk = defineSkill({
    name: "skill.demo", version: 1, domain: "ops", description: "デモ手順", input: { type: "object", properties: { date: { type: "string" } } }, permission: [],
    steps: (input) => [
      { key: "a", title: "A", tool: "a.read@1", input: { date: input.date ?? "2026-09-28" } },
      { key: "b", title: "B", tool: "b.read@1", input: {} },
      { key: "c", title: "C（A に依存）", tool: "b.read@1", dependsOn: ["a"], bind: { "input.date": "a.date" } },
    ],
    summarize: (steps) => `A=${stepRows(steps, "a").length} B=${stepRows(steps, "b").length}`,
  });
  registry.register(skillToTool(sk as never));
  const r = await executeTool({ registry, admin, context: baseContext({ actor: owner, company, surface: "web" }), ref: "skill.demo", input: { date: "2026-10-01" }, catalog });
  assert.equal(r.status, "ok", r.error ?? "");
  const out = r.output as { __plan: number; status: string; summary: string; steps: Array<{ key: string; status: string; output: { date: string } }> };
  assert.equal(out.__plan, 1);
  assert.equal(out.status, "done");
  assert.equal(out.summary, "A=2 B=3");
  // a（30ms 遅い）と b は同時に走るので b が先に終わる。c は a の出力（date）を受け取る
  assert.deepEqual(order.slice(0, 2), ["b.read", "a.read"]);
  assert.equal(out.steps.find((s) => s.key === "c")?.output.date, "2026-10-01");
  const bl = blocksFromExecution(blocks, r);
  assert.equal(bl[0].block, "PlanCard");
  assert.equal((bl[0].data.steps as unknown[]).length, 3);
  assert.equal(bl.filter((b) => b.block === "Table").length, 3);
  assert.ok(bl.some((b) => b.block === "SourceNote"));
  // 実行記録は Skill 1行 ＋ Step 3行
  assert.equal(admin.tables.gn_tool_executions.length, 4);
});

test("Step の権限は Step ごとに効く（Skill が権限をまとめて持たない）。承認が要る Step は実行せず waiting_approval で止まる", async () => {
  const { admin, registry, catalog } = setup();
  const sk = defineSkill({
    name: "skill.mixed", version: 1, domain: "ops", description: "混在", input: { type: "object" }, permission: [],
    steps: () => [
      { key: "ok", title: "誰でも", tool: "a.read@1" },
      { key: "hq", title: "本部だけ", tool: "hq.read@1" },
      { key: "send", title: "送信（risk 3）", tool: "x.send@1" },
      { key: "after", title: "送信のあと", tool: "b.read@1", dependsOn: ["send"] },
    ],
  });
  registry.register(skillToTool(sk as never));
  const r = await executeTool({ registry, admin, context: baseContext({ actor: staff, company, surface: "web" }), ref: "skill.mixed", input: {}, catalog });
  assert.equal(r.status, "ok");
  const st = Object.fromEntries((r.output as { steps: Array<{ key: string; status: string }> }).steps.map((s) => [s.key, s.status]));
  assert.equal(st.ok, "done");
  assert.equal(st.hq, "failed"); // denied → その Step だけ失敗として残る
  assert.equal(st.send, "waiting_approval");
  assert.equal(st.after, "skipped");
  assert.equal((r.output as { status: string }).status, "failed"); // 失敗した Step があれば Plan 全体は failed（承認待ちより優先して目立たせる）
  // 送信は実行されていない（記録は needs_approval）
  const sendRow = admin.tables.gn_tool_executions.find((x) => x.tool_name === "x.send");
  assert.equal(sendRow?.status, "needs_approval");
});

test("runPlan: Plan が不正（循環）なら実行前に落ちる", async () => {
  const { admin, registry, catalog } = setup();
  const context = baseContext({ actor: owner, company, surface: "web" });
  const ctx = {
    admin, context,
    call: async (ref: string, input: Record<string, unknown>) => executeTool({ registry, admin, context, ref, input, catalog }),
    emit: async () => {}, log: () => {},
  };
  const plan = { id: null, goal: "x", status: "draft" as const, steps: [newStep({ key: "a", tool: "a.read@1", dependsOn: ["b"] }), newStep({ key: "b", tool: "b.read@1", dependsOn: ["a"] })] };
  await assert.rejects(() => runPlan(plan, ctx as never), /循環/);
});

test("P3-a の Skill 3本が Core に登録され、参照する Tool が全部存在する", () => {
  const { registry } = createGenesisCore();
  assert.equal(SKILL_TOOLS.length, 3);
  for (const t of SKILL_TOOLS) assert.ok(registry.has(`${t.name}@${t.version}`), t.name);
  const ctx = baseContext({ actor: owner, company, surface: "web" });
  for (const sk of [morningBriefing, trialFollowup, executiveReport]) {
    for (const s of sk.steps({} as never, ctx)) assert.ok(registry.has(s.tool), `${sk.name} → ${s.tool} が未登録`);
  }
});
