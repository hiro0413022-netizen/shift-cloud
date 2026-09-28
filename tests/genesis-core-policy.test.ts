// Genesis Core P0: Policy Engine（Tool×Role×Store×Amount×Context×Risk）。
// GO条件: 権限不足・店舗外・金額超過・AI代理 の4ケースが deny / approval になる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicy, defaultDecision, stricter } from "../packages/genesis-core/src/policy.ts";
import { baseContext, type CoreActor } from "../packages/genesis-core/src/context.ts";
import { defineTool } from "../packages/genesis-core/src/tool.ts";

const STORE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STORE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const company = { id: "c1", name: "YOZAN", kind: "operating" as const };

const staff: CoreActor = { staffId: "s1", name: "店舗スタッフ", kind: "human", isOwner: false, permissions: ["use_reception"], storeIds: [STORE_A], primaryStoreId: STORE_A };
const manager: CoreActor = { ...staff, staffId: "s2", name: "店長", permissions: ["use_reception", "manage_shifts"] };
const owner: CoreActor = { ...staff, staffId: "s0", name: "オーナー", isOwner: true, permissions: ["manage_company", "view_hq"], storeIds: [STORE_A, STORE_B] };

const tool = (over: Partial<Parameters<typeof defineTool>[0]>) =>
  defineTool({
    name: "t.x", version: 1, domain: "ops", description: "t", input: { type: "object" }, output: { type: "object" },
    permission: [], scope: "company", risk: 0, idempotency: () => null, rateLimit: { perMinute: 10 }, emits: [], renders: "Table",
    impl: async () => ({}), ...over,
  } as never);

const ctxOf = (actor: CoreActor, surface: "web" | "mcp" = "web", hour = 12) => {
  const c = baseContext({ actor, company, surface });
  c.time = { ...c.time, jstHour: hour };
  return c;
};

test("既定: risk 0/1=allow, 2=auto_undo(5分), 3=approval, 4=two_step", () => {
  assert.deepEqual(defaultDecision(0), { decision: "allow", undoMinutes: 0 });
  assert.deepEqual(defaultDecision(2), { decision: "auto_undo", undoMinutes: 5 });
  assert.equal(defaultDecision(3).decision, "approval");
  assert.equal(defaultDecision(4).decision, "two_step");
  assert.equal(stricter("allow", "approval"), "approval");
  assert.equal(stricter("deny", "allow"), "deny");
});

test("1) 権限不足は deny。オーナーは常に可", () => {
  const t = tool({ permission: ["manage_shifts"], risk: 2, undo: async () => {}, verify: async () => true });
  assert.equal(evaluatePolicy({ tool: t, input: {}, context: ctxOf(staff) }).decision, "deny");
  assert.equal(evaluatePolicy({ tool: t, input: {}, context: ctxOf(manager) }).decision, "auto_undo");
  assert.equal(evaluatePolicy({ tool: t, input: {}, context: ctxOf(owner) }).decision, "auto_undo");
});

test("2) 店舗スコープ: 所属外の store_id は deny（id直打ちで抜けない #134）", () => {
  const t = tool({ scope: "store", permission: ["use_reception"] });
  assert.equal(evaluatePolicy({ tool: t, input: { store_id: STORE_B }, context: ctxOf(staff) }).decision, "deny");
  assert.equal(evaluatePolicy({ tool: t, input: {}, context: ctxOf(staff) }).decision, "allow");
  assert.equal(evaluatePolicy({ tool: t, input: { store_id: STORE_B }, context: ctxOf(owner) }).decision, "allow");
});

test("3) Tool 固有ルール: shift.publish は店長以上、payroll.update は Finance/Owner", () => {
  const publish = tool({ name: "shift.publish", permission: ["use_reception", "manage_shifts"], risk: 2, undo: async () => {}, verify: async () => true });
  const policy = { rules: [{ tool: "shift.publish", requirePermissions: ["manage_shifts"] }, { tool: "payroll.update", requirePermissions: ["manage_payroll"] }] };
  assert.equal(evaluatePolicy({ tool: publish, input: {}, context: ctxOf(staff), policy }).decision, "deny");
  assert.equal(evaluatePolicy({ tool: publish, input: {}, context: ctxOf(manager), policy }).decision, "auto_undo");
  const payroll = tool({ name: "payroll.update", permission: [], risk: 2, undo: async () => {}, verify: async () => true });
  assert.equal(evaluatePolicy({ tool: payroll, input: {}, context: ctxOf(manager), policy }).decision, "deny");
  assert.equal(evaluatePolicy({ tool: payroll, input: {}, context: ctxOf(owner), policy }).decision, "auto_undo");
});

test("4) 金額超過は approval に格上げ（格下げはしない）", () => {
  const t = tool({ name: "expense.add", risk: 2, undo: async () => {}, verify: async () => true, amount: (i: { amount?: number }) => i.amount ?? null });
  const policy = { rules: [{ tool: "expense.add", maxAmount: 50_000 }] };
  assert.equal(evaluatePolicy({ tool: t, input: { amount: 30_000 }, context: ctxOf(owner), policy }).decision, "auto_undo");
  const r = evaluatePolicy({ tool: t, input: { amount: 80_000 }, context: ctxOf(owner), policy });
  assert.equal(r.decision, "approval");
  assert.equal(r.stage, "amount");
});

test("5) AI は代理元の人の権限を超えない。代理元なしの AI 更新は approval。MCP の送信は approval", () => {
  const t = tool({ permission: ["manage_shifts"], risk: 2, undo: async () => {}, verify: async () => true });
  const aiForStaff: CoreActor = { ...staff, kind: "ai", permissions: ["manage_company"], isOwner: true, onBehalfOf: staff };
  assert.equal(evaluatePolicy({ tool: t, input: {}, context: ctxOf(aiForStaff) }).decision, "deny");
  const aiAlone: CoreActor = { ...owner, kind: "ai", onBehalfOf: null };
  assert.equal(evaluatePolicy({ tool: t, input: {}, context: ctxOf(aiAlone) }).decision, "approval");
  const send = tool({ name: "message.send", risk: 3, undo: async () => {}, verify: async () => true });
  const legacy = { rules: [], legacyModes: { "message.send": { mode: "auto_undo" as const, undoMinutes: 5 } } };
  assert.equal(evaluatePolicy({ tool: send, input: {}, context: ctxOf(owner, "web", 12), policy: legacy }).decision, "auto_undo");
  assert.equal(evaluatePolicy({ tool: send, input: {}, context: ctxOf(owner, "mcp", 12), policy: legacy }).decision, "approval");
  assert.equal(evaluatePolicy({ tool: send, input: {}, context: ctxOf(owner, "web", 23), policy: legacy }).decision, "approval");
});

test("read_only ロールは更新 Tool を使えない", () => {
  const ro: CoreActor = { ...staff, permissions: ["use_reception", "read_only"] };
  const t = tool({ permission: ["use_reception"], risk: 2, undo: async () => {}, verify: async () => true });
  assert.equal(evaluatePolicy({ tool: t, input: {}, context: ctxOf(ro) }).decision, "deny");
  assert.equal(evaluatePolicy({ tool: tool({ permission: ["use_reception"] }), input: {}, context: ctxOf(ro) }).decision, "allow");
});
