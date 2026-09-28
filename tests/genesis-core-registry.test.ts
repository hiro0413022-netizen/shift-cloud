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
