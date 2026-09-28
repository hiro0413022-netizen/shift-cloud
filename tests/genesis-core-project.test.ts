// Genesis P4-d（#303）: Projects — 案件を作る・紐づける・カード（記憶＋紐づき＋動き）
import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../packages/genesis-core/src/execute.ts";
import { createGenesisCore } from "../packages/genesis-core/src/tools/all.ts";
import { blocksFromExecution } from "../packages/genesis-core/src/render.ts";
import { baseContext, type CoreActor } from "../packages/genesis-core/src/context.ts";
import { createFakeAdmin } from "./fixtures/fake-admin.ts";

const company = { id: "c1", name: "YOZAN", kind: "operating" as const };
const owner: CoreActor = { staffId: "s0", name: "オーナー", kind: "human", isOwner: true, permissions: ["manage_company"], storeIds: ["frank"], primaryStoreId: "frank" };
const staff: CoreActor = { staffId: "s1", name: "受付", kind: "human", isOwner: false, permissions: ["use_reception"], storeIds: ["frank"], primaryStoreId: "frank" };

test("project.create → project.link / memory(project) → project.card に全部載る。作れるのは本部だけ、紐づけは誰でも", async () => {
  const admin = createFakeAdmin();
  const { registry, catalog, blocks } = createGenesisCore();
  const run = (actor: CoreActor, ref: string, input: Record<string, unknown>) => executeTool({ registry, admin, context: baseContext({ actor, company, surface: "web" }), ref, input, catalog });

  const denied = await run(staff, "project.create", { name: "x案件" });
  assert.equal(denied.status, "denied");

  const c = await run(owner, "project.create", { name: "GOLF WING 2号店 出店計画", slug: "gw-2nd-store", goal: "出店判断の材料をそろえる", due_on: "2026-12-31" });
  assert.equal(c.status, "ok", c.error ?? "");
  const pid = String(c.output?.project_id);
  // 同じ slug の2回目は idempotent
  assert.equal((await run(owner, "project.create", { name: "GOLF WING 2号店 出店計画", slug: "gw-2nd-store" })).status, "idempotent");

  const l1 = await run(staff, "project.link", { project: "2号店", kind: "note", label: "候補物件は3件" });
  assert.equal(l1.status, "ok", l1.error ?? "");
  assert.equal(l1.output?.project_id, pid);
  const l2 = await run(staff, "project.link", { project: "gw-2nd-store", kind: "link", label: "事業計画書", url: "https://example.com/plan.pdf" });
  assert.equal(l2.status, "ok");
  const m = await run(owner, "memory.remember", { value: "2号店は5打席・借入700万版で進める", scope: "project", scope_id: pid });
  assert.equal(m.status, "ok", m.error ?? "");
  const notFound = await run(staff, "project.link", { project: "無い案件", kind: "note", label: "x" });
  assert.equal(notFound.status, "failed");

  const card = await run(staff, "project.card", { q: "2号店" });
  assert.equal(card.status, "ok", card.error ?? "");
  const out = card.output as { found: boolean; project: { name: string }; memories: unknown[]; items: unknown[]; timeline: unknown[] };
  assert.equal(out.found, true);
  assert.equal(out.project.name, "GOLF WING 2号店 出店計画");
  assert.equal(out.memories.length, 1);
  assert.equal(out.items.length, 2);
  assert.equal(out.timeline.length, 2);
  const bl = blocksFromExecution(blocks, card);
  assert.equal(bl[0].block, "EntityCard");
  assert.equal(bl[0].data.href, "/projects/gw-2nd-store");
  assert.ok((bl[0].data.fields as Array<{ k: string }>).some((f) => f.k === "記憶"));
  assert.ok(bl.some((b) => b.block === "Timeline" && String(b.data.entity).startsWith("project:")));

  const miss = await run(staff, "project.card", { q: "3号店" });
  assert.equal((miss.output as { found: boolean }).found, false);
  const list = await run(staff, "project.list", {});
  assert.equal(list.rowCount, 1);
  assert.equal((list.output as { rows: Array<{ 紐づき: number }> }).rows[0].紐づき, 2);
});
