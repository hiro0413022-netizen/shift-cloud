import type { AdminClient, CntPost, GeneratedPost, Material, Product } from "./types";
import { buildCaption } from "./generate";
import { igConfigForProduct, publishImagePost, type IgConfig } from "./instagram";

/**
 * サーバー側API（service_role クライアントを引数で受け取る＝アプリ非依存。@yozan/track と同方式）。
 */

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));

const SELECT_POST =
  "id, company_id, product, platform, theme, hook, body, hashtags, status, scheduled_at, posted_at, ig_media_id, error, source, metrics, queue_id, created_at";

export function toPost(r: Row): CntPost {
  return {
    id: String(r.id),
    companyId: String(r.company_id),
    product: String(r.product) as Product,
    platform: String(r.platform ?? "instagram"),
    theme: s(r.theme),
    hook: String(r.hook ?? ""),
    body: String(r.body ?? ""),
    hashtags: Array.isArray(r.hashtags) ? (r.hashtags as string[]) : [],
    status: String(r.status) as CntPost["status"],
    scheduledAt: s(r.scheduled_at),
    postedAt: s(r.posted_at),
    igMediaId: s(r.ig_media_id),
    error: s(r.error),
    source: (r.source ?? {}) as Record<string, unknown>,
    metrics: (r.metrics ?? {}) as Record<string, unknown>,
    queueId: s(r.queue_id),
    createdAt: String(r.created_at),
  };
}

/** 直近N日で使った題材（重複回避用） */
export async function listRecentThemes(admin: AdminClient, companyId: string, days = 21): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const { data } = await admin
    .from("cnt_posts")
    .select("theme")
    .eq("company_id", companyId)
    .gte("created_at", since)
    .is("deleted_at", null);
  return ((data ?? []) as Row[]).map((r) => String(r.theme ?? "")).filter(Boolean);
}

/**
 * SWING CORTEX 資産（sc_symptoms → sc_checkpoints → sc_knowledge）から本日の題材を1つ引く。
 * 直近に使った症状は避ける。知見が1件も無い症状はスキップ（中身の無い投稿を作らない）。
 */
export async function pickMaterial(
  admin: AdminClient,
  companyId: string,
  avoidThemes: string[]
): Promise<Material | null> {
  const { data: symptoms } = await admin
    .from("sc_symptoms")
    .select("id, name, category")
    .eq("company_id", companyId)
    .eq("active", true)
    .is("deleted_at", null)
    .limit(200);
  const avoid = new Set(avoidThemes);
  const pool = ((symptoms ?? []) as Row[]).filter((r) => !avoid.has(String(r.name)));
  if (pool.length === 0) return null;

  // シャッフルして知見のある症状に当たるまで最大5つ試す
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
  for (const sym of shuffled) {
    const { data: cps } = await admin
      .from("sc_checkpoints")
      .select("id, title")
      .eq("symptom_id", sym.id)
      .is("deleted_at", null)
      .order("priority", { ascending: true })
      .limit(3);
    const cpRows = (cps ?? []) as Row[];
    if (cpRows.length === 0) continue;
    const { data: kn } = await admin
      .from("sc_knowledge")
      .select("checkpoint_id, cause, fix, drill")
      .in(
        "checkpoint_id",
        cpRows.map((c) => c.id)
      )
      .is("deleted_at", null)
      .limit(6);
    const knByCp = new Map<string, Row>();
    for (const k of (kn ?? []) as Row[]) {
      if (!knByCp.has(String(k.checkpoint_id))) knByCp.set(String(k.checkpoint_id), k);
    }
    const points = cpRows.map((c) => {
      const k = knByCp.get(String(c.id));
      return {
        title: String(c.title),
        cause: k ? s(k.cause) : null,
        fix: k ? s(k.fix) : null,
        drill: k ? s(k.drill) : null,
      };
    });
    if (points.some((p) => p.cause || p.fix)) {
      return { symptomId: String(sym.id), symptomName: String(sym.name), category: s(sym.category), points };
    }
  }
  return null;
}

/** 生成結果を draft として保存 */
export async function insertDraft(
  admin: AdminClient,
  input: { companyId: string; product: Product; gen: GeneratedPost; scheduledAt: string; source: Record<string, unknown> }
): Promise<string | null> {
  const { data } = await admin
    .from("cnt_posts")
    .insert({
      company_id: input.companyId,
      product: input.product,
      platform: "instagram",
      theme: input.gen.theme,
      hook: input.gen.hook,
      body: input.gen.body,
      hashtags: input.gen.hashtags,
      status: "awaiting_approval",
      scheduled_at: input.scheduledAt,
      source: { ...input.source, generator: input.gen.generator },
    })
    .select("id")
    .single();
  return data?.id ? String(data.id) : null;
}

/** 承認カード（ai_action_queue）との紐付け */
export async function attachQueue(admin: AdminClient, postId: string, queueId: string): Promise<void> {
  await admin.from("cnt_posts").update({ queue_id: queueId, updated_at: new Date().toISOString() }).eq("id", postId);
}

/**
 * 承認実行（executorのsns_postハンドラから）。
 * 判断フィードでの修正（payload.body差し替え）をここで cnt_posts に同期する。
 * 予定時刻が過去なら「いま」に繰り上げ（次の10分tickで即投稿）。
 */
export async function markScheduled(
  admin: AdminClient,
  input: { postId: string; body?: string | null; hook?: string | null }
): Promise<CntPost | null> {
  const { data: row } = await admin.from("cnt_posts").select(SELECT_POST).eq("id", input.postId).maybeSingle();
  if (!row) return null;
  const post = toPost(row as Row);
  const scheduledAt =
    post.scheduledAt && post.scheduledAt > new Date().toISOString() ? post.scheduledAt : new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: "scheduled",
    scheduled_at: scheduledAt,
    error: null,
    updated_at: new Date().toISOString(),
  };
  if (input.body && input.body.trim()) patch.body = input.body.trim();
  if (input.hook && input.hook.trim()) patch.hook = input.hook.trim().slice(0, 30);
  await admin.from("cnt_posts").update(patch).eq("id", input.postId);
  const { data: updated } = await admin.from("cnt_posts").select(SELECT_POST).eq("id", input.postId).maybeSingle();
  return updated ? toPost(updated as Row) : null;
}

/** 承認カードが却下されたのに残っている投稿を rejected に同期（日次の掃除） */
export async function syncRejected(admin: AdminClient, companyId: string): Promise<number> {
  const { data: waiting } = await admin
    .from("cnt_posts")
    .select("id, queue_id")
    .eq("company_id", companyId)
    .eq("status", "awaiting_approval")
    .not("queue_id", "is", null)
    .is("deleted_at", null);
  let n = 0;
  for (const w of (waiting ?? []) as Row[]) {
    const { data: q } = await admin.from("ai_action_queue").select("status").eq("id", w.queue_id).maybeSingle();
    if (q && String(q.status) === "cancelled") {
      await admin
        .from("cnt_posts")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", w.id);
      n += 1;
    }
  }
  return n;
}

export type PublishSummary = {
  due: number;
  posted: number;
  failed: number;
  skipped?: string; // IG未設定など
};

/**
 * 予定時刻を過ぎた scheduled を Instagram へ投稿する（10分cronから）。
 * 投稿先アカウントは商品ごとに解決（igConfigForProduct）。
 * IG env 未設定の商品は何もせず注記だけ残す（failedにしない＝設定後にそのまま流れる）。
 */
export async function publishDue(
  admin: AdminClient,
  companyId: string,
  opts: { cardBaseUrl: string; limit?: number }
): Promise<PublishSummary> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await admin
    .from("cnt_posts")
    .select(SELECT_POST)
    .eq("company_id", companyId)
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(opts.limit ?? 3);
  const due = (rows ?? []) as Row[];
  const summary: PublishSummary = { due: due.length, posted: 0, failed: 0 };
  if (due.length === 0) return summary;

  let anyConfigured = false;
  for (const r of due) {
    const post = toPost(r);
    const ig: IgConfig | null = igConfigForProduct(post.product);
    if (!ig) {
      // 設定不足の注記（1回だけ書く）。scheduledのまま保持＝env設定後の次tickで自動投稿される
      if (!post.error) {
        const envs =
          post.product === "webdesign"
            ? "IG_ACCESS_TOKEN_WEB / IG_BUSINESS_ID_WEB（@yozan_web_jp）"
            : "IG_ACCESS_TOKEN / IG_BUSINESS_ID（@swingcortex_jp）";
        await admin
          .from("cnt_posts")
          .update({ error: `${envs} 未設定（Vercel envに設定すると自動投稿されます）` })
          .eq("id", post.id);
      }
      continue;
    }
    anyConfigured = true;
    try {
      const { mediaId } = await publishImagePost(ig, {
        imageUrl: `${opts.cardBaseUrl}/api/public/ai-sales/card/${post.id}`,
        caption: buildCaption(post.body, post.hashtags),
      });
      await admin
        .from("cnt_posts")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          ig_media_id: mediaId,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      summary.posted += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin
        .from("cnt_posts")
        .update({ status: "failed", error: msg.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", post.id);
      summary.failed += 1;
    }
  }
  if (!anyConfigured) summary.skipped = "ig_not_configured";
  return summary;
}

/** 週次レポート用の集計（過去N日） */
export async function contentStats(
  admin: AdminClient,
  companyId: string,
  days = 7
): Promise<{ generated: number; posted: number; failed: number }> {
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const base = () => admin.from("cnt_posts").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("deleted_at", null);
  const [g, p, f] = await Promise.all([
    base().gte("created_at", since),
    base().eq("status", "posted").gte("posted_at", since),
    base().eq("status", "failed").gte("updated_at", since),
  ]);
  return { generated: g.count ?? 0, posted: p.count ?? 0, failed: f.count ?? 0 };
}
