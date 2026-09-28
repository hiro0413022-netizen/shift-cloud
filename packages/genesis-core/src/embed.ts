/**
 * 埋め込み（Semantic Search の入口・#300）。Gemini gemini-embedding-001・768次元。
 * lesson-os / swing-cortex と同じ GEMINI_API_KEY（業者を増やさない #179/#182）。
 * L3（議事録・契約）はここに通さない＝呼ぶ側（semantic.ts の SOURCES）に L3 が無い。
 */
import type { AdminLike } from "./tool.ts";

export const EMBED_DIM = 768;
export const EMBED_MODEL = process.env.GENESIS_EMBED_MODEL || "gemini-embedding-001";

export type EmbedKind = "document" | "query";
export type EmbedFn = (texts: string[], kind: EmbedKind) => Promise<number[][]>;

/** 1リクエストの本数。上限は 100 だが、無料枠の分あたりトークン制限（429 Resource exhausted）に当たったので小さく刻む */
const BATCH = Number(process.env.GENESIS_EMBED_BATCH ?? 25);
const RETRY = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function hasEmbedKey(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

/** Gemini REST。失敗は投げる（呼ぶ側が job の error に残す） */
export async function embedTexts(texts: string[], kind: EmbedKind = "document", opts: { admin?: AdminLike; companyId?: string | null; timeoutMs?: number } = {}): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 未設定（埋め込みを作れません）");
  const out: number[][] = [];
  const started = Date.now();
  let chars = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    chars += slice.reduce((s, t) => s + t.length, 0);
    const body = JSON.stringify({
      requests: slice.map((t) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: t.slice(0, 6000) }] },
        taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
        outputDimensionality: EMBED_DIM,
      })),
    });
    let json: { embeddings?: Array<{ values?: number[] }> } | null = null;
    for (let attempt = 0; attempt <= RETRY; attempt += 1) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
      if (res.ok) {
        json = (await res.json()) as { embeddings?: Array<{ values?: number[] }> };
        break;
      }
      const text = (await res.text()).replace(/\s+/g, " ").slice(0, 160);
      // 429 / 503 は少し待って再試行（無料枠の分あたり制限）。それ以外は即失敗
      if ((res.status === 429 || res.status === 503) && attempt < RETRY) {
        await sleep(2_000 * (attempt + 1));
        continue;
      }
      throw new Error(`Gemini embed HTTP ${res.status}: ${text}`);
    }
    if (!json) throw new Error("Gemini embed: 応答なし");
    const vecs = (json.embeddings ?? []).map((e) => e.values ?? []);
    if (vecs.length !== slice.length) throw new Error(`Gemini embed: 返った本数が違う（${vecs.length}/${slice.length}）`);
    for (const v of vecs) {
      if (v.length !== EMBED_DIM) throw new Error(`Gemini embed: 次元が違う（${v.length}）`);
      out.push(normalize(v));
    }
  }
  // 記録（gn_llm_calls）: 埋め込みも LLM 費用として Dashboard に載せる。トークンは文字数/4 の概算
  if (opts.admin && opts.companyId && texts.length) {
    try {
      const tokens = Math.round(chars / 4);
      await opts.admin.from("gn_llm_calls").insert({ company_id: opts.companyId, task: "extract", privacy: "L2", provider: "gemini", model: EMBED_MODEL, tool: kind === "query" ? "search.semantic" : "embed:index", input_tokens: tokens, output_tokens: 0, cost_usd: (tokens / 1_000_000) * 0.15, duration_ms: Date.now() - started, ok: true });
    } catch {
      /* 記録失敗で止めない */
    }
  }
  return out;
}

/** 768 次元を切り出すと単位長でなくなるので正規化（cosine を正しく） */
function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

/** pgvector のリテラル '[0.1,0.2,…]' */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(7) : "0")).join(",")}]`;
}
