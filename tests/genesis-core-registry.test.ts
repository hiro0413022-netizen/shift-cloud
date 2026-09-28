// Genesis Core P0（DECISIONS #290）: Tool Registry / Contract / Block / Event / Schema の固定。
// 「登録できない Tool は実行時に『積んだが実行されない』を作らない」線をここで守る。
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../packages/genesis-core/src/schema.ts";
import { parseToolRef, validateContract, defineTool } from "../packages/genesis-core/src/tool.ts";
import { ToolRegistry } from "../packages/genesis-core/src/registry.ts";
import { createBlockRegistry } from "../packages/genesis-core/src/blocks.ts";
import { createEventCatalog } from "../packages/genesis-core/src/events.ts";
import { createGenesisCore, CORE_TOOLS } from "../packages/genesis-core/src/tools/all.ts";

test("schema: default を埋め、必須・型・format を全部集めて返す", () => {
  const s = { type: "object", required: ["date"], properties: { date: { type: "string", format: "date" }, minutes: { type: "integer", default: 60 }, lefty: { type: "boolean" } } } as const;
  const ok = validate(s, { date: "2026-09-28" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { date: "2026-09-28", minutes: 60 });
  const ng = validate(s, { date: "9/28", minutes: 1.5, lefty: "yes" });
  assert.equal(ng.ok, false);
  assert.equal(ng.errors.length, 3);
});

test("parseToolRef: name@version と最新指定", () => {
  assert.deepEqual(parseToolRef("booking.create@2"), { name: "booking.create", version: 2 });
  assert.deepEqual(parseToolRef("booking.create"), { name: "booking.create", version: null });
  assert.throws(() => parseToolRef("Booking"), /形式/);
});

test("contract: risk>=2 は undo/verify が必須。emits は entity.verb@version", () => {
  const base = defineTool({
    name: "x.write", version: 1, domain: "ops", description: "t", input: { type: "object" }, output: { type: "object" },
    permission: [], scope: "company", risk: 2, idempotency: () => null, rateLimit: { perMinute: 1 }, emits: ["bad"], renders: "Table",
    impl: async () => ({}),
  });
  const errs = validateContract(base as never);
  assert.ok(errs.some((e) => /undo/.test(e)));
  assert.ok(errs.some((e) => /verify/.test(e)));
  assert.ok(errs.some((e) => /emits/.test(e)));
});

test("registry: 版が並存し、版なしは最新。renders は Block Registry で検証", () => {
  const blocks = createBlockRegistry();
  const reg = new ToolRegistry({ blocks });
  const mk = (version: number, renders = "Table") =>
    defineTool({ name: "a.b", version, domain: "ops", description: "t", input: { type: "object" }, output: { type: "object" }, permission: [], scope: "company", risk: 0, idempotency: () => null, rateLimit: { perMinute: 1 }, emits: [], renders, impl: async () => ({}) });
  reg.register(mk(1) as never).register(mk(2) as never);
  assert.equal(reg.resolve("a.b")?.version, 2);
  assert.equal(reg.resolve("a.b@1")?.version, 1);
  assert.equal(reg.resolve("a.c"), null);
  assert.throws(() => reg.register(mk(1) as never), /重複/);
  assert.throws(() => reg.register(mk(3, "NoSuchBlock") as never), /Block Registry/);
  assert.equal(reg.list({ latestOnly: true }).length, 1);
  const mcp = reg.mcpManifest();
  assert.equal(mcp.tools.length, 2);
  assert.equal(mcp.tools[0].name, "a.b__v1");
  assert.equal(ToolRegistry.fromMcpName("a.b__v1"), "a.b@1");
});

test("P0 の Tool 一式は 20 本以上登録でき、全 emits がイベントカタログに存在する", () => {
  const { registry, catalog } = createGenesisCore();
  assert.ok(registry.size() >= 20, `registered ${registry.size()}`);
  assert.equal(registry.size(), CORE_TOOLS.length);
  for (const t of registry.list()) {
    for (const e of t.emits) {
      const [type, v] = e.split("@");
      assert.ok(catalog.get(type, Number(v)), `${t.ref} emits ${e} がカタログに無い`);
    }
  }
  // 5ドメインすべてに最低1本
  for (const d of ["ops", "customer", "finance", "growth", "dev"]) assert.ok(registry.list({ domain: d as never }).length >= 1, d);
});

test("event catalog: 未登録イベントは存在しない・payload は検証される", () => {
  const c = createEventCatalog();
  assert.deepEqual(c.check("reservation.created", 1, { booking_id: "x", date: "2026-09-28" }), []);
  assert.ok(c.check("reservation.created", 1, { date: "2026-09-28" }).length > 0);
  assert.ok(c.check("nothing.happened", 1, {}).length > 0);
});

test("block registry: 形に合わない data は SourceNote に落として壊さない", () => {
  const b = createBlockRegistry();
  const good = b.make("KPI", { label: "売上", value: 100 }, { kind: "fact" });
  assert.equal(good.block, "KPI");
  const bad = b.make("KPI", { label: "売上" }, { kind: "fact" });
  assert.equal(bad.block, "SourceNote");
  const unknown = b.make("Nope", {}, { kind: "fact" });
  assert.equal(unknown.block, "SourceNote");
});

test("render: Tool の出力を Block にし、出典（SourceNote）を必ず添える。失敗は SourceNote に落ちる", async () => {
  const { blocksFromExecution } = await import("../packages/genesis-core/src/render.ts");
  const blocks = createBlockRegistry();
  const ok = blocksFromExecution(blocks, {
    status: "ok", executionId: "x", tool: "booking.list@1", output: { rows: [{ booked_date: "2026-09-29", start_time: "10:00", customer_name: "田中" }], count: 1, date: "2026-09-29" },
    sources: [{ table: "gnv_bookings", updatedAt: "2026-09-28T10:00:00Z", verified: true }], kind: "fact", rowCount: 1, silentZero: false, policy: null, error: null, durationMs: 1, logs: [], renders: "BookingList",
  });
  assert.equal(ok[0].block, "BookingList");
  assert.equal((ok[0].data.items as unknown[]).length, 1);
  assert.equal(ok[1].block, "Table");
  assert.equal(ok.at(-1)?.block, "SourceNote");
  assert.equal(ok[0].meta.kind, "fact");
  const ng = blocksFromExecution(blocks, { status: "denied", executionId: null, tool: "x.y@1", output: null, sources: [], kind: "fact", rowCount: null, silentZero: false, policy: null, error: "権限不足", durationMs: 1, logs: [], renders: "Table" });
  assert.equal(ng[0].block, "SourceNote");
  const kpi = blocksFromExecution(blocks, { status: "ok", executionId: "x", tool: "sales.daily@1", output: { rows: [], count: 0, date: "2026-09-27", total: 120000, prev_total: 100000 }, sources: [{ table: "gnv_sales" }], kind: "calculated", rowCount: 0, silentZero: false, policy: null, error: null, durationMs: 1, logs: [], renders: "KPI" });
  assert.equal(kpi[0].block, "KPI");
  assert.equal(kpi[0].data.delta, 20000);
  assert.equal(kpi[0].meta.kind, "calculated");
});

test("期間: to はその日を含む。from=to の1日指定で 0 件にならない（2026-09-28 実機バグ）", async () => {
  const { inclusiveRange } = await import("../packages/genesis-core/src/tools/_shared.ts");
  assert.deepEqual(inclusiveRange("2026-09-30", "2026-09-30", 7, "2026-09-28"), { from: "2026-09-30", to: "2026-10-01" });
  assert.deepEqual(inclusiveRange("2026-09-30", undefined, 7, "2026-09-28"), { from: "2026-09-30", to: "2026-10-07" });
  assert.deepEqual(inclusiveRange(undefined, undefined, 1, "2026-09-28"), { from: "2026-09-28", to: "2026-09-29" });
  assert.deepEqual(inclusiveRange("2026-09-30", "2026-09-01", 3, "2026-09-28"), { from: "2026-09-30", to: "2026-10-03" });
});
