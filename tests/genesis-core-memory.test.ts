// Genesis P4-a（#299）: Memory 5スコープ。AI の推定は confidence<1 で「推定」・人が確認して 1.0。Context にはスコープに合うものだけ入る。
import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../packages/genesis-core/src/execute.ts";
import { createGenesisCore } from "../packages/genesis-core/src/tools/all.ts";
import { baseContext, enrichContext, type CoreActor } from "../packages/genesis-core/src/context.ts";
import { loadMemory, memoryPromptLines, memoryKey, toContextMemory } from "../packages/genesis-core/src/memory.ts";
import { createFakeAdmin } from "./fixtures/fake-admin.ts";

const company = { id: "c1", name: "YOZAN", kind: "operating" as const };
const owner: CoreActor = { staffId: "s0", name: "オーナー", kind: "human", isOwner: true, permissions: ["manage_company"], storeIds: ["frank", "gw"], primaryStoreId: "frank" };
const staff: CoreActor = { staffId: "s1", name: "受付", kind: "human", isOwner: false, permissions: ["use_reception"], storeIds: ["gw"], primaryStoreId: "gw" };
const ai: CoreActor = { staffId: null, name: "Genesis", kind: "ai", isOwner: true, permissions: ["manage_company"], storeIds: [], primaryStoreId: null, onBehalfOf: null };

test("memoryKey: 英字はそのまま・日本語はハッシュで安定", () => {
  assert.equal(memoryKey("Booking.Lefty Bay"), "booking.lefty_bay");
  assert.equal(memoryKey("提出物に「仮」を出さない"), memoryKey("提出物に「仮」を出さない"));
  assert.match(memoryKey("提出物に「仮」を出さない"), /^said\.[0-9a-z]+$/);
});

test("loadMemory: company は全員・store は見える店舗だけ・user は本人だけ・期限切れは外す", async () => {
  const admin = createFakeAdmin({
    gn_memories: [
      { id: "m1", company_id: "c1", scope: "company", scope_id: null, key: "a", value: "会社ルール", confidence: 1, updated_at: "2026-09-01" },
      { id: "m2", company_id: "c1", scope: "store", scope_id: "frank", key: "b", value: "FRANKの事情", confidence: 1, updated_at: "2026-09-01" },
      { id: "m3", company_id: "c1", scope: "store", scope_id: "gw", key: "c", value: "GWの事情", confidence: 0.6, updated_at: "2026-09-01" },
      { id: "m4", company_id: "c1", scope: "user", scope_id: "s0", key: "d", value: "オーナーの好み", confidence: 1, updated_at: "2026-09-01" },
      { id: "m5", company_id: "c1", scope: "customer", scope_id: "090", key: "e", value: "田中さんは午後希望", confidence: 1, updated_at: "2026-09-01" },
      { id: "m6", company_id: "c1", scope: "company", scope_id: null, key: "f", value: "期限切れ", confidence: 1, expires_at: "2020-01-01T00:00:00Z", updated_at: "2026-09-01" },
      { id: "m7", company_id: "other", scope: "company", scope_id: null, key: "g", value: "他社", confidence: 1, updated_at: "2026-09-01" },
    ],
  });
  const forOwner = await loadMemory(admin, baseContext({ actor: owner, company, surface: "web" }));
  assert.deepEqual(forOwner.map((m) => m.id).sort(), ["m1", "m2", "m3", "m4"]);
  const forStaff = await loadMemory(admin, baseContext({ actor: staff, company, surface: "web" }));
  assert.deepEqual(forStaff.map((m) => m.id).sort(), ["m1", "m3"]);
  const withCustomer = await loadMemory(admin, baseContext({ actor: staff, company, surface: "web" }), { customerId: "090" });
  assert.ok(withCustomer.some((m) => m.id === "m5"));
  // prompt: 推定は明示
  const lines = memoryPromptLines(forStaff, { storeNames: { gw: "GOLF WING" } });
  assert.ok(lines.some((l) => l.includes("[店舗・GOLF WING] GWの事情（推定 60%・未確認）")));
  assert.ok(lines.some((l) => l === "- [会社] 会社ルール"));
  assert.deepEqual(toContextMemory(forStaff).find((m) => m.key === "c"), { scope: "store:gw", key: "c", value: "GWの事情", confidence: 0.6 });
  // enrichContext が memory を積む
  const ctx = await enrichContext(admin, baseContext({ actor: staff, company, surface: "web" }));
  assert.equal(ctx.memory.length, 2);
});

test("memory.remember: 人が言えば 1.0・AI の推定は 0.6・同じ key は上書き。confirm は人だけ。forget は soft delete で undo できる", async () => {
  const admin = createFakeAdmin();
  const { registry, catalog } = createGenesisCore();
  const run = (actor: CoreActor, ref: string, input: Record<string, unknown>) => executeTool({ registry, admin, context: baseContext({ actor, company, surface: "web" }), ref, input, catalog });

  const r1 = await run(owner, "memory.remember", { value: "提出物に「仮」を出さない", scope: "company" });
  assert.equal(r1.status, "ok", r1.error ?? "");
  assert.equal(r1.output?.confidence, 1);
  assert.equal(admin.tables.gn_memories.length, 1);
  assert.equal(admin.tables.gn_memories[0].stated_by, "s0");

  // 同じ内容をもう一度 → idempotent（実行されない）
  const r1b = await run(owner, "memory.remember", { value: "提出物に「仮」を出さない", scope: "company" });
  assert.equal(r1b.status, "idempotent");

  // 同じ key に別の値 → 上書き（行は増えない）
  const r1c = await run(owner, "memory.remember", { value: "提出物に「仮」を出さない（PDF も）", scope: "company", key: r1.output?.key as string });
  assert.equal(r1c.status, "ok");
  assert.equal(r1c.output?.replaced, true);
  assert.equal(admin.tables.gn_memories.length, 1);

  // AI（代理元なし）が書く → 推定 0.6・stated_by null
  const r2 = await run(ai, "memory.remember", { value: "田中さんは午後を好む", scope: "customer", scope_id: "090" });
  assert.equal(r2.status, "ok", r2.error ?? "");
  assert.equal(r2.output?.confidence, 0.6);
  const aiRow = admin.tables.gn_memories.find((m) => m.scope === "customer")!;
  assert.equal(aiRow.stated_by, null);
  assert.equal(aiRow.verified_at, null);

  // user スコープは本人に固定
  const r3 = await run(staff, "memory.remember", { value: "税抜で見たい", scope: "user" });
  assert.equal(admin.tables.gn_memories.find((m) => m.scope === "user")!.scope_id, "s1");

  // customer に scope_id が無ければ失敗
  const r4 = await run(owner, "memory.remember", { value: "電話が分からないお客様", scope: "customer" });
  assert.equal(r4.status, "failed");

  // confirm: AI はできない・人はできる
  const c1 = await run(ai, "memory.confirm", { memory_id: String(aiRow.id) });
  assert.equal(c1.status, "failed");
  const c2 = await run(owner, "memory.confirm", { memory_id: String(aiRow.id) });
  assert.equal(c2.status, "ok", c2.error ?? "");
  assert.equal(admin.tables.gn_memories.find((m) => m.id === aiRow.id)!.confidence, 1);

  // forget → deleted_at が付く → Context から消える → undo で戻る
  const f = await run(owner, "memory.forget", { memory_id: String(aiRow.id) });
  assert.equal(f.status, "ok", f.error ?? "");
  assert.ok(admin.tables.gn_memories.find((m) => m.id === aiRow.id)!.deleted_at);
  const after = await loadMemory(admin, baseContext({ actor: owner, company, surface: "web" }), { customerId: "090" });
  assert.ok(!after.some((m) => m.id === aiRow.id));
  const { undoExecution } = await import("../packages/genesis-core/src/execute.ts");
  const u = await undoExecution({ registry, admin, context: baseContext({ actor: owner, company, surface: "web" }), executionId: f.executionId!, catalog });
  assert.equal(u.ok, true, u.error);
  assert.equal(admin.tables.gn_memories.find((m) => m.id === aiRow.id)!.deleted_at, null);
});
