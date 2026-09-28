/**
 * Memory（5スコープ・1表・#299）— gn_memories の読み書き。
 *
 *   user     … その人の好み（午前に承認をまとめる・税抜で見たい）
 *   company  … 会社のルール（藤田プロの名前を出さない・「仮」を出さない）・DECISIONS / decision_logs の取り込み
 *   store    … 店舗の事情（レフティはB打席・休会費）
 *   customer … お客様ごと（ドライバー相談中・午後希望）
 *   project  … 案件（2号店は5打席）
 *
 * ルール: AI が書いた記憶は confidence < 1（推定）。人が memory.confirm で 1.0 に上げるまで Context には「推定」として入る。
 * 読み込みは Context の組み立て（enrichContext）で1回。Tool は ctx.context.memory を見るだけで DB を再照会しない。
 */
import type { AdminLike } from "./tool.ts";
import type { GenesisContext } from "./context.ts";
import { effectiveActor, visibleStoreIds } from "./context.ts";

export type MemoryScope = "user" | "company" | "store" | "customer" | "project";
export const MEMORY_SCOPES: readonly MemoryScope[] = ["user", "company", "store", "customer", "project"];

export type MemoryEntry = { id: string; scope: MemoryScope; scopeId: string | null; key: string; value: string; confidence: number; source: string | null; verifiedAt: string | null; expiresAt: string | null };

type Row = Record<string, unknown>;

const toEntry = (r: Row): MemoryEntry => ({
  id: String(r.id),
  scope: String(r.scope) as MemoryScope,
  scopeId: r.scope_id == null ? null : String(r.scope_id),
  key: String(r.key),
  value: String(r.value),
  confidence: Number(r.confidence ?? 1),
  source: r.source == null ? null : String(r.source),
  verifiedAt: r.verified_at == null ? null : String(r.verified_at),
  expiresAt: r.expires_at == null ? null : String(r.expires_at),
});

/**
 * Context に入れる記憶を集める: company 全部 ＋ 見える店舗の store ＋ 本人の user ＋（あれば）今の customer / project。
 * 期限切れは外す。件数は上限で切る（Context を太らせない）。
 */
export async function loadMemory(admin: AdminLike, ctx: GenesisContext, opts: { customerId?: string | null; projectId?: string | null; limit?: number } = {}): Promise<MemoryEntry[]> {
  const a = effectiveActor(ctx.actor);
  const stores = visibleStoreIds(ctx);
  const nowIso = new Date().toISOString();
  const limit = opts.limit ?? 80;
  try {
    const q = admin
      .from("gn_memories")
      .select("id, scope, scope_id, key, value, confidence, source, verified_at, expires_at")
      .eq("company_id", ctx.company.id)
      .is("deleted_at", null)
      .order("confidence", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit * 3);
    const { data } = await q;
    const rows = ((data ?? []) as Row[]).map(toEntry);
    const customerId = opts.customerId ?? (ctx.entity?.kind === "person" ? ctx.entity.id : null);
    const projectId = opts.projectId ?? ctx.project?.id ?? ctx.focus?.projectId ?? null;
    const keep = rows.filter((m) => {
      if (m.expiresAt && m.expiresAt < nowIso) return false;
      if (m.scope === "company") return true;
      if (m.scope === "store") return !m.scopeId || stores.includes(m.scopeId) || a.isOwner;
      if (m.scope === "user") return !!a.staffId && m.scopeId === a.staffId;
      if (m.scope === "customer") return !!customerId && m.scopeId === customerId;
      if (m.scope === "project") return !!projectId && m.scopeId === projectId;
      return false;
    });
    return keep.slice(0, limit);
  } catch {
    return [];
  }
}

/** Context.memory の形（scope / key / value / confidence）に落とす */
export function toContextMemory(list: MemoryEntry[]): GenesisContext["memory"] {
  return list.map((m) => ({ scope: m.scopeId ? `${m.scope}:${m.scopeId}` : m.scope, key: m.key, value: m.value, confidence: m.confidence }));
}

/** LLM の system prompt に入れる文字列。confidence<1 は「推定」を明示（GO条件: AI推測と事実を分ける） */
export function memoryPromptLines(list: MemoryEntry[], opts: { storeNames?: Record<string, string> } = {}): string[] {
  const label = (m: MemoryEntry) => {
    if (m.scope === "company") return "会社";
    if (m.scope === "store") return `店舗${m.scopeId && opts.storeNames?.[m.scopeId] ? "・" + opts.storeNames[m.scopeId] : ""}`;
    if (m.scope === "user") return "あなた（本人）";
    if (m.scope === "customer") return "このお客様";
    return "この案件";
  };
  return list.map((m) => `- [${label(m)}] ${m.value}${m.confidence < 1 ? `（推定 ${Math.round(m.confidence * 100)}%・未確認）` : ""}`);
}

/** key の形: 小文字・ドット区切り（'booking.lefty_bay'）。自由文から作るときは slug 化する */
export function memoryKey(input: string): string {
  const t = input.trim();
  const s = t.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  if (s.length >= 3 && /[a-z]/.test(s)) return s.slice(0, 80);
  // 日本語の自由文はハッシュで安定した key に（同じ文を2回覚えても1行）
  let h = 5381;
  for (let i = 0; i < t.length; i += 1) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return `said.${h.toString(36)}`;
}
