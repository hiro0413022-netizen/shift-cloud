/**
 * search.semantic（#300）— 文章の意味検索。「腰が引ける生徒へのアドバイスは？」「〇〇について過去に話したこと」。
 * 数字の質問はここではなく sales.query（Ask Data）。結果には必ず出典（表・日付・id）が付く。
 */
import { defineTool, type ToolContract } from "../tool.ts";
import { src } from "./_shared.ts";
import { SOURCES, semanticSearch } from "../semantic.ts";
import { embedTexts, hasEmbedKey } from "../embed.ts";

export const searchSemantic = defineTool({
  name: "search.semantic",
  version: 1,
  domain: "customer",
  description: "文章の意味検索: レッスンコメント（4万件）・会話メモ・音声メモ・Genesis の記憶から、質問に近い文を探す。「〜という症状にどう教えた？」「〇〇について過去のコメント」はこれ。数字は sales.query",
  input: { type: "object", required: ["query"], properties: { query: { type: "string", minLength: 2, maxLength: 300 }, sources: { type: "array", items: { type: "string", enum: SOURCES.map((s) => s.name) }, description: "省略時は全部" }, limit: { type: "integer", minimum: 1, maximum: 50, default: 12 } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" }, query: { type: "string" } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 30 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    if (!hasEmbedKey()) throw new Error("GEMINI_API_KEY 未設定（意味検索は使えません）");
    const hits = await semanticSearch(ctx.admin, ctx.context, (t, k) => embedTexts(t, k, { admin: ctx.admin, companyId: ctx.context.company.id }), String(input.query), { sources: Array.isArray(input.sources) && input.sources.length ? (input.sources as string[]) : undefined, limit: Number(input.limit ?? 12) });
    const rows = hits.map((h) => ({ 近さ: `${Math.round(h.similarity * 100)}%`, 種類: h.label, 見出し: h.title, 本文: h.chunk.length > 240 ? h.chunk.slice(0, 240) + "…" : h.chunk, 日付: h.at ?? "", id: h.sourceId }));
    return { data: { rows, count: rows.length, query: String(input.query) }, sources: [...new Set(hits.map((h) => h.source))].map((t) => src(t)), kind: "fact", rowCount: rows.length };
  },
});

export const SEARCH_TOOLS: ToolContract[] = [searchSemantic] as unknown as ToolContract[];
