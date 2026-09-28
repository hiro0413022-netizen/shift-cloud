// Genesis P4-b（#300）: Semantic Search — 増分取り込み（(created_at,id) カーソル・予算）と検索（出典つき）
import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, indexSemantic, semanticSearch, SOURCES } from "../packages/genesis-core/src/semantic.ts";
import { toVectorLiteral, EMBED_DIM } from "../packages/genesis-core/src/embed.ts";
import { baseContext, type CoreActor } from "../packages/genesis-core/src/context.ts";
import { createFakeAdmin } from "./fixtures/fake-admin.ts";

const C = "c1";
const owner: CoreActor = { staffId: "s0", name: "o", kind: "human", isOwner: true, permissions: ["manage_company"], storeIds: [], primaryStoreId: null };
const fakeEmbed = async (texts: string[]) => texts.map((t) => { const v = new Array(EMBED_DIM).fill(0); v[0] = 1; v[1] = t.length % 7; return v; });

test("chunkText: 1,500 字で文の切れ目に分ける・空は 0 本", () => {
  assert.deepEqual(chunkText("  "), []);
  assert.deepEqual(chunkText("短い。"), ["短い。"]);
  const long = "あ".repeat(900) + "。" + "い".repeat(900) + "。";
  const c = chunkText(long);
  assert.equal(c.length, 2);
  assert.ok(c.every((x) => x.length <= 1500));
});

test("toVectorLiteral: pgvector の '[…]'", () => {
  assert.equal(toVectorLiteral([0.5, 1]), "[0.5000000,1.0000000]");
});

test("indexSemantic: 同じ created_at が並んでも (created_at,id) カーソルで取りこぼさない・予算で止まり次の tick が続きを取る・本文の無い行は飛ばす", async () => {
  const at = "2026-09-01T00:00:00Z";
  const admin = createFakeAdmin({
    sc_comments: [
      { id: "a1", company_id: C, coach_name: "藤田", student_ref: "S1", course: "A", body: "腰が引ける。左足体重で構える", created_at: at },
      { id: "a2", company_id: C, coach_name: "藤田", student_ref: "S2", course: "A", body: "", created_at: at },
      { id: "a3", company_id: C, coach_name: "小川", student_ref: "S3", course: "B", body: "トップで右肘が浮く", created_at: at },
      { id: "a4", company_id: C, coach_name: "小川", student_ref: "S3", course: "B", body: "フォローで頭が上がる", created_at: "2026-09-02T00:00:00Z" },
      { id: "z9", company_id: "other", coach_name: "x", student_ref: "S9", course: "B", body: "他社", created_at: at },
    ],
  });
  const calls: number[] = [];
  const embed = async (texts: string[], kind: string) => { calls.push(texts.length); assert.equal(kind, "document"); return fakeEmbed(texts); };
  const r1 = await indexSemantic(admin, C, embed, { budget: 2, sources: ["sc_comments"] });
  assert.equal(r1.bySource.sc_comments, 1); // a1 は本文あり・a2 は空
  assert.equal(admin.tables.gn_embeddings.length, 1);
  const cur1 = admin.tables.gn_embed_cursors[0];
  assert.equal(cur1.cursor_id, "a2");
  const r2 = await indexSemantic(admin, C, embed, { budget: 2, sources: ["sc_comments"] });
  assert.equal(r2.bySource.sc_comments, 2); // a3（同じ created_at・id が後）と a4
  assert.equal(admin.tables.gn_embeddings.length, 3);
  assert.deepEqual(admin.tables.gn_embeddings.map((e) => e.source_id).sort(), ["a1", "a3", "a4"]);
  assert.equal(admin.tables.gn_embeddings.find((e) => e.source_id === "a1")!.entity_id, "S1");
  assert.match(String(admin.tables.gn_embeddings[0].embedding), /^\[/);
  const r3 = await indexSemantic(admin, C, embed, { budget: 2, sources: ["sc_comments"] });
  assert.equal(r3.indexed, 0);
  assert.deepEqual(calls, [1, 2]);
  // もう一度同じ行が来ても upsert（増えない）
  admin.tables.gn_embed_cursors.length = 0;
  await indexSemantic(admin, C, embed, { budget: 10, sources: ["sc_comments"] });
  assert.equal(admin.tables.gn_embeddings.length, 3);
});

test("indexSemantic: 埋め込みが失敗しても他の source は進み、error は cursor に残る", async () => {
  const admin = createFakeAdmin({
    sc_comments: [{ id: "a1", company_id: C, coach_name: "藤田", body: "x", created_at: "2026-09-01T00:00:00Z" }],
    gn_memories: [{ id: "m1", company_id: C, scope: "company", key: "k", value: "提出物に仮を出さない", created_at: "2026-09-01T00:00:00Z" }],
  });
  const embed = async (texts: string[]) => { if (texts[0] === "x") throw new Error("quota"); return fakeEmbed(texts); };
  const r = await indexSemantic(admin, C, embed, { budget: 10 });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /sc_comments: quota/);
  assert.equal(r.bySource.gn_memories, 1);
  assert.equal(admin.tables.gn_embed_cursors.find((c) => c.source === "sc_comments")!.last_error, "quota");
});

test("semanticSearch: 質問を query として埋め込み、RPC の結果に種類・日付・出典を付ける", async () => {
  const admin = createFakeAdmin();
  const seen: unknown[] = [];
  admin.rpc = async (name: string, args: Record<string, unknown>) => {
    seen.push(name, args);
    return { data: [{ id: "e1", source: "sc_comments", source_id: "a1", chunk_no: 0, entity_kind: "person", entity_id: "S1", title: "2026-09-01 · 藤田", chunk: "腰が引ける", meta: {}, source_at: "2026-09-01T00:00:00Z", similarity: 0.83 }], error: null };
  };
  const hits = await semanticSearch(admin, baseContext({ actor: owner, company: { id: C, name: "Y", kind: "operating" }, surface: "web" }), async (t, k) => { assert.equal(k, "query"); return fakeEmbed(t); }, "腰が引ける生徒", { limit: 5 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].label, "レッスンコメント");
  assert.equal(hits[0].at, "2026-09-01");
  assert.equal(hits[0].entity?.id, "S1");
  assert.equal(seen[0], "gn_semantic_search");
  assert.equal((seen[1] as Record<string, unknown>).p_limit, 5);
  assert.ok(SOURCES.every((s) => !/mtg_|contract|legal/.test(s.table)), "L3（議事録・契約）は入れない");
});
