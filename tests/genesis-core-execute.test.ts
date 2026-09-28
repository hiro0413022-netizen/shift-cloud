// Genesis Core P0: Action Engine（executeTool）と Plan(DAG)。
// GO条件: 同じ idempotency key で2回呼んでも実行は1回。verify 失敗は成功扱いにしない。承認が要る Tool はここで実行しない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool, undoExecution } from "../packages/genesis-core/src/execute.ts";
import { ToolRegistry } from "../packages/genesis-core/src/registry.ts";
import { createBlockRegistry } from "../packages/genesis-core/src/blocks.ts";
import { createEventCatalog } from "../packages/genesis-core/src/events.ts";
import { defineTool } from "../packages/genesis-core/src/tool.ts";
import { baseContext, type CoreActor } from "../packages/genesis-core/src/context.ts";
import { validatePlan, readySteps, linearPlan, newStep, bindInput, planStatus } from "../packages/genesis-core/src/plan.ts";
import { aggregateExecutions } from "../packages/genesis-core/src/metrics.ts";
import { createFakeAdmin } from "./fixtures/fake-admin.ts";

const company = { id: "c1", name: "YOZAN", kind: "operating" as const };
const owner: CoreActor = { staffId: "s0", name: "オーナー", kind: "human", isOwner: true, permissions: ["manage_company"], storeIds: ["st1"], primaryStoreId: "st1" };
const ctx = () => baseContext({ actor: owner, company, surface: "web" });

function setup() {
  const admin = createFakeAdmin();
  const blocks = createBlockRegistry();
  const catalog = createEventCatalog();
  const registry = new ToolRegistry({ blocks });
  let runs = 0;
  let cancelled = 0;
  const create = defineTool({
    name: "demo.create", version: 1, domain: "ops", description: "作る",
    input: { type: "object", required: ["key"], properties: { key: { type: "string" }, bad: { type: "boolean", default: false } } },
    output: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    permission: [], scope: "company", risk: 2, idempotency: (i) => `k:${i.key}`, rateLimit: { perMinute: 100 },
    undo: async (out, c) => { cancelled += 1; c.log(`undo ${out.id}`); },
    verify: async (out) => out.id !== "unverifiable",
    emits: ["reservation.created@1"], renders: "BookingCard",
    impl: async (i, c) => {
      runs += 1;
      const id = i.bad ? "unverifiable" : `id-${runs}`;
      await c.emit("reservation.created", 1, { booking_id: id, date: "2026-09-28", summary: "作った" });
      return { id };
    },
  });
  const read = defineTool({
    name: "demo.read", version: 1, domain: "finance", description: "読む",
    input: { type: "object" }, output: { type: "object", properties: { rows: { type: "array" } } },
    permission: [], scope: "company", risk: 0, idempotency: () => null, rateLimit: { perMinute: 100 }, emits: [], renders: "Table", minRows: 1,
    impl: async () => ({ data: { rows: [] }, rowCount: 0, sources: [{ table: "gnv_x" }] }),
  });
  const send = defineTool({
    name: "demo.send", version: 1, domain: "customer", description: "送る",
    input: { type: "object" }, output: { type: "object" }, permission: [], scope: "company", risk: 3,
    idempotency: () => null, rateLimit: { perMinute: 100 }, undo: async () => {}, verify: async () => true, emits: [], renders: "MessageDraft",
    impl: async () => ({ sent: true }),
  });
  registry.register(create as never).register(read as never).register(send as never);
  return { admin, registry, catalog, counters: { get runs() { return runs; }, get cancelled() { return cancelled; } } };
}

test("承認が要る Tool（risk 2 = auto_undo）は force 無しでは実行せず needs_approval", async () => {
  const { admin, registry, catalog, counters } = setup();
  const r = await executeTool({ registry, admin, context: ctx(), ref: "demo.create", input: { key: "a" }, catalog });
  assert.equal(r.status, "needs_approval");
  assert.equal(r.policy?.decision, "auto_undo");
  assert.equal(counters.runs, 0);
  assert.equal(admin.tables.gn_tool_executions.length, 1);
});

test("idempotency: 同じ鍵の2回目は実行せず前回の出力。イベントは1回だけ", async () => {
  const { admin, registry, catalog, counters } = setup();
  const a = await executeTool({ registry, admin, context: ctx(), ref: "demo.create", input: { key: "a" }, catalog, force: true });
  const b = await executeTool({ registry, admin, context: ctx(), ref: "demo.create", input: { key: "a" }, catalog, force: true });
  assert.equal(a.status, "ok");
  assert.equal(b.status, "idempotent");
  assert.deepEqual(b.output, a.output);
  assert.equal(counters.runs, 1);
  assert.equal(admin.tables.gn_events.length, 1);
  assert.equal(admin.tables.gn_events[0].schema_version, 1);
  const c = await executeTool({ registry, admin, context: ctx(), ref: "demo.create", input: { key: "b" }, catalog, force: true });
  assert.equal(c.status, "ok");
  assert.equal(counters.runs, 2);
});

test("verify 失敗は verify_failed（成功扱いにしない）＋ tool.failed イベント", async () => {
  const { admin, registry, catalog } = setup();
  const r = await executeTool({ registry, admin, context: ctx(), ref: "demo.create", input: { key: "x", bad: true }, catalog, force: true });
  assert.equal(r.status, "verify_failed");
  assert.ok(admin.tables.gn_events.some((e) => e.type === "tool.failed"));
  const row = admin.tables.gn_tool_executions.find((e) => e.status === "verify_failed");
  assert.ok(row);
});

test("入力検証・未登録 Tool・黙って0件", async () => {
  const { admin, registry, catalog } = setup();
  const bad = await executeTool({ registry, admin, context: ctx(), ref: "demo.create", input: {}, catalog, force: true });
  assert.equal(bad.status, "invalid_input");
  const unknown = await executeTool({ registry, admin, context: ctx(), ref: "nope.tool", input: {}, catalog });
  assert.equal(unknown.status, "unknown_tool");
  const zero = await executeTool({ registry, admin, context: ctx(), ref: "demo.read", input: {}, catalog });
  assert.equal(zero.status, "ok");
  assert.equal(zero.silentZero, true);
  assert.ok(admin.tables.gn_events.some((e) => e.type === "tool.silent_zero"));
  assert.equal(zero.sources[0].table, "gnv_x");
});

test("undo: 実行済みを取り消し、記録に undone_at が付く", async () => {
  const { admin, registry, catalog, counters } = setup();
  const r = await executeTool({ registry, admin, context: ctx(), ref: "demo.create", input: { key: "u" }, catalog, force: true });
  const u = await undoExecution({ registry, admin, context: ctx(), executionId: r.executionId!, catalog });
  assert.equal(u.ok, true);
  assert.equal(counters.cancelled, 1);
  const again = await undoExecution({ registry, admin, context: ctx(), executionId: r.executionId!, catalog });
  assert.equal(again.ok, false);
});

test("MCP surface の送信は approval に格上げ（記録に policy_stage=context）", async () => {
  const { admin, registry, catalog } = setup();
  const c = baseContext({ actor: owner, company, surface: "mcp" });
  const r = await executeTool({ registry, admin, context: c, ref: "demo.send", input: {}, catalog, policy: { rules: [], legacyModes: { "demo.send": { mode: "auto", undoMinutes: 0 } } } });
  assert.equal(r.status, "needs_approval");
  assert.equal(r.policy?.decision, "approval");
  assert.equal(admin.tables.gn_tool_executions[0].policy_stage, "context");
});

test("Plan(DAG): 循環を拒否し、依存が揃った Step だけ ready。失敗の下流は skipped", () => {
  const cyc = { id: null, goal: "g", status: "draft" as const, steps: [newStep({ key: "a", tool: "x.y@1", dependsOn: ["b"] }), newStep({ key: "b", tool: "x.y@1", dependsOn: ["a"] })] };
  assert.ok(validatePlan(cyc).some((e) => /循環/.test(e)));
  const plan = { id: null, goal: "g", status: "draft" as const, steps: [
    newStep({ key: "a", tool: "x.y@1" }), newStep({ key: "b", tool: "x.y@1" }),
    newStep({ key: "c", tool: "x.y@1", dependsOn: ["a", "b"], bind: { "input.date": "a.data.date" } }),
    newStep({ key: "d", tool: "x.y@1", dependsOn: ["c"], condition: { stepKey: "c", path: "data.count", op: "gt", value: 0 } }),
  ] };
  assert.deepEqual(validatePlan(plan), []);
  assert.deepEqual(readySteps(plan).map((s) => s.key), ["a", "b"]);
  plan.steps[0].status = "done"; plan.steps[0].output = { data: { date: "2026-10-01" } };
  assert.deepEqual(readySteps(plan).map((s) => s.key), ["b"]);
  plan.steps[1].status = "done";
  assert.deepEqual(readySteps(plan).map((s) => s.key), ["c"]);
  assert.deepEqual(bindInput(plan.steps[2], plan.steps), { date: "2026-10-01" });
  plan.steps[2].status = "done"; plan.steps[2].output = { data: { count: 0 } };
  assert.deepEqual(readySteps(plan).map((s) => s.key), []);
  assert.equal(plan.steps[3].status, "skipped");
  assert.equal(planStatus(plan), "done");
  const lin = linearPlan("直列", [{ tool: "a.b@1" }, { tool: "c.d@1" }]);
  assert.deepEqual(lin.steps[1].dependsOn, ["s1"]);
});

test("metrics: 実行行から成功率・承認率・Undo率を出す", () => {
  const m = aggregateExecutions([
    { tool_name: "a.b", tool_version: 1, status: "ok", policy_decision: "allow", policy_stage: "risk", risk: 2, surface: "web", origin: null, actor_kind: "human", duration_ms: 100, silent_zero: false, undone_at: null, created_at: "" },
    { tool_name: "a.b", tool_version: 1, status: "needs_approval", policy_decision: "approval", policy_stage: "risk", risk: 3, surface: "web", origin: null, actor_kind: "ai", duration_ms: 5, silent_zero: false, undone_at: null, created_at: "" },
    { tool_name: "a.b", tool_version: 1, status: "ok", policy_decision: "auto_undo", policy_stage: "risk", risk: 2, surface: "web", origin: null, actor_kind: "human", duration_ms: 300, silent_zero: false, undone_at: "x", created_at: "" },
    { tool_name: "c.d", tool_version: 1, status: "denied", policy_decision: "deny", policy_stage: "permission", risk: 2, surface: "mcp", origin: null, actor_kind: "ai", duration_ms: 1, silent_zero: false, undone_at: null, created_at: "" },
  ]);
  assert.equal(m.total, 4);
  assert.equal(m.successRate, 66.7);
  assert.equal(m.humanApproval, 1);
  assert.equal(m.undo, 1);
  assert.equal(m.undoRate, 50);
  assert.equal(m.permissionDeniedRate, 25);
  assert.equal(m.automationRate, 25);
  assert.equal(m.byTool[0].tool, "a.b@1");
});
