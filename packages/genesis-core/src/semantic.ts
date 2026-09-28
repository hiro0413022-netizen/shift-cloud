/**
 * Semantic Search（#300・P4-b）— 文章の意味検索。数値は Ask Data（SQL）、文章はここ。
 *
 *   SOURCES         … 何を埋め込むか（表・本文の作り方・見出し・Entity）。L3（議事録・契約）は入れない
 *   indexSemantic() … cron から。source ごとに created_at のカーソルで増分取り込み（1 tick の予算つき）
 *   semanticSearch()… 質問を埋め込み → gn_semantic_search（cosine）
 *
 * 取り込みは Postgres 側に書くだけ（LLM は埋め込みのみ）。検索結果には必ず出典（source / id / 日付）が付く。
 */
import type { AdminLike } from "./tool.ts";
import type { GenesisContext } from "./context.ts";
import { toVectorLiteral, type EmbedFn } from "./embed.ts";

type Row = Record<string, unknown>;

export type SemanticSource = {
  name: string;
  table: string;
  label: string;
  select: string;
  /** 本文（空なら取り込まない） */
  text: (r: Row) => string;
  title: (r: Row) => string;
  entity: (r: Row) => { kind: string; id: string } | null;
  /** created_at 相当（カーソル） */
  at: (r: Row) => string;
  /** 会社の絞り込み列（無い表は無い） */
  companyCol?: string;
  /** deleted_at があれば除外 */
  softDelete?: boolean;
};

const s = (v: unknown): string => (v == null ? "" : String(v)).trim();

export const SOURCES: SemanticSource[] = [
  {
    name: "sc_comments", table: "sc_comments", label: "レッスンコメント",
    select: "id, coach_name, student_ref, course, body, symptom_key, created_at",
    text: (r) => s(r.body),
    title: (r) => [s(r.created_at).slice(0, 10), s(r.coach_name), s(r.student_ref) ? `生徒 ${s(r.student_ref)}` : "", s(r.course)].filter(Boolean).join(" · "),
    entity: (r) => (s(r.student_ref) ? { kind: "person", id: s(r.student_ref) } : null),
    at: (r) => s(r.created_at),
    companyCol: "company_id",
  },
  {
    name: "lsn_lesson_notes", table: "lsn_lesson_notes", label: "会話メモ（レッスンノート）",
    select: "id, student_id, lesson_date, body, share_body, created_at, deleted_at",
    text: (r) => s(r.body) || s(r.share_body),
    title: (r) => [s(r.lesson_date), "レッスンノート"].filter(Boolean).join(" · "),
    entity: (r) => (s(r.student_id) ? { kind: "person", id: s(r.student_id) } : null),
    at: (r) => s(r.created_at),
    companyCol: "company_id",
    softDelete: true,
  },
  {
    name: "sc_voice_notes", table: "sc_voice_notes", label: "音声メモ（AIカルテナレッジ）",
    select: "id, lesson_date, comment_body, coach_note, created_at, deleted_at",
    text: (r) => [s(r.comment_body), s(r.coach_note)].filter(Boolean).join("\n"),
    title: (r) => [s(r.lesson_date), "音声メモ"].filter(Boolean).join(" · "),
    entity: () => null,
    at: (r) => s(r.created_at),
    companyCol: "company_id",
    softDelete: true,
  },
  {
    name: "gn_memories", table: "gn_memories", label: "Genesis の記憶",
    select: "id, scope, scope_id, key, value, source, created_at, deleted_at",
    text: (r) => s(r.value),
    title: (r) => `記憶（${s(r.scope)}${s(r.scope_id) ? ":" + s(r.scope_id).slice(0, 8) : ""}）`,
    entity: (r) => (s(r.scope) === "customer" && s(r.scope_id) ? { kind: "person", id: s(r.scope_id) } : null),
    at: (r) => s(r.created_at),
    companyCol: "company_id",
    softDelete: true,
  },
];

/** 長文は 1,500 字で分割（埋め込みの精度と表示のため） */
export function chunkText(text: string, size = 1500): string[] {
  const t = text.replace(/\r/g, "").trim();
  if (t.length <= size) return t ? [t] : [];
  const out: string[] = [];
  let buf = "";
  for (const para of t.split(/\n{2,}|(?<=[。．！？\n])/)) {
    if ((buf + para).length > size && buf) {
      out.push(buf.trim());
      buf = "";
    }
    buf += para;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * 増分取り込み。source ごとに (created_at, id) のカーソルから budget 件まで。
 * 1 tick で終わらない前提（sc_comments 4万件）。次の tick が続きを取る。
 */
export async function indexSemantic(admin: AdminLike, companyId: string, embed: EmbedFn, opts: { budget?: number; sources?: string[] } = {}): Promise<{ indexed: number; bySource: Record<string, number>; done: boolean; errors: string[] }> {
  let remaining = opts.budget ?? 500;
  const bySource: Record<string, number> = {};
  const errors: string[] = [];
  let done = true;
  for (const src of SOURCES) {
    if (opts.sources && !opts.sources.includes(src.name)) continue;
    if (remaining <= 0) {
      done = false;
      break;
    }
    try {
      const { data: cur } = await admin.from("gn_embed_cursors").select("cursor_at, cursor_id, indexed").eq("company_id", companyId).eq("source", src.name).maybeSingle();
      const cursorAt = cur?.cursor_at ? String(cur.cursor_at) : null;
      const cursorId = cur?.cursor_id ? String(cur.cursor_id) : null;
      let q = admin.from(src.table).select(src.select).eq(src.companyCol ?? "company_id", companyId).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(Math.min(remaining, 200));
      // (created_at, id) の組でカーソル。同じ created_at が大量にある（Excel 一括取込）ので created_at だけでは取りこぼす
      if (cursorAt && cursorId) q = q.or(`created_at.gt.${cursorAt},and(created_at.eq.${cursorAt},id.gt.${cursorId})`);
      else if (cursorAt) q = q.gt("created_at", cursorAt);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = ((data ?? []) as Row[]).filter((r) => !(src.softDelete && r.deleted_at));
      if (!rows.length) continue;
      // 本文の無い行はカーソルだけ進める
      const items: Array<{ row: Row; chunks: string[] }> = rows.map((row) => ({ row, chunks: chunkText(src.text(row)) }));
      const texts = items.flatMap((it) => it.chunks);
      const vecs = texts.length ? await embed(texts, "document") : [];
      let vi = 0;
      const inserts: Row[] = [];
      for (const it of items) {
        it.chunks.forEach((chunk, chunkNo) => {
          const e = src.entity(it.row);
          inserts.push({
            company_id: companyId, source: src.name, source_id: s(it.row.id), chunk_no: chunkNo,
            entity_kind: e?.kind ?? null, entity_id: e?.id ?? null, title: src.title(it.row).slice(0, 200), chunk,
            embedding: toVectorLiteral(vecs[vi++]), meta: {}, source_at: src.at(it.row) || null, updated_at: new Date().toISOString(),
          });
        });
      }
      if (inserts.length) {
        const { error: upErr } = await admin.from("gn_embeddings").upsert(inserts, { onConflict: "company_id,source,source_id,chunk_no" });
        if (upErr) throw new Error(upErr.message);
      }
      const last = rows[rows.length - 1];
      await admin.from("gn_embed_cursors").upsert({ company_id: companyId, source: src.name, cursor_at: src.at(last), cursor_id: s(last.id), indexed: Number(cur?.indexed ?? 0) + inserts.length, last_error: null, updated_at: new Date().toISOString() }, { onConflict: "company_id,source" });
      bySource[src.name] = inserts.length;
      remaining -= rows.length;
      // 取り切れていない（limit いっぱい返った）なら次の tick へ
      if ((data ?? []).length >= 200) done = false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${src.name}: ${msg}`);
      try {
        await admin.from("gn_embed_cursors").upsert({ company_id: companyId, source: src.name, last_error: msg, updated_at: new Date().toISOString() }, { onConflict: "company_id,source" });
      } catch {
        /* 記録失敗は無視 */
      }
    }
  }
  const indexed = Object.values(bySource).reduce((a, b) => a + b, 0);
  return { indexed, bySource, done, errors };
}

export type SemanticHit = { source: string; label: string; sourceId: string; title: string; chunk: string; entity: { kind: string; id: string } | null; at: string | null; similarity: number };

export async function semanticSearch(admin: AdminLike, ctx: GenesisContext, embed: EmbedFn, query: string, opts: { sources?: string[]; limit?: number } = {}): Promise<SemanticHit[]> {
  const [vec] = await embed([query], "query");
  const { data, error } = await admin.rpc("gn_semantic_search", { p_company_id: ctx.company.id, p_query: toVectorLiteral(vec), p_sources: opts.sources ?? null, p_limit: opts.limit ?? 20 });
  if (error) throw new Error(`gn_semantic_search 失敗: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    source: s(r.source),
    label: SOURCES.find((x) => x.name === s(r.source))?.label ?? s(r.source),
    sourceId: s(r.source_id),
    title: s(r.title),
    chunk: s(r.chunk),
    entity: s(r.entity_kind) ? { kind: s(r.entity_kind), id: s(r.entity_id) } : null,
    at: r.source_at ? String(r.source_at).slice(0, 10) : null,
    similarity: Number(r.similarity ?? 0),
  }));
}
