import type { AdminClient, CntPost, GeneratedPost, Material, Product } from "./types";
import { buildCaption } from "./generate";
import { igConfigForProduct, publishImagePost, type IgConfig } from "./instagram";
import { xConfigFromEnv, publishTweet, publishThread, uploadMedia, buildTweetText, type XConfig } from "./x";

/**
 * サーバー側API（service_role クライアントを引数で受け取る＝アプリ非依存。@yozan/track と同方式）。
 */

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));

const SELECT_POST =
  "id, company_id, product, platform, theme, hook, body, hashtags, status, scheduled_at, posted_at, ig_media_id, x_tweet_id, x_posted_at, error, x_error, thread_parts, thread_tweet_ids, source, metrics, queue_id, created_at";

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map((x) => String(x)) : []);

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
    xTweetId: s(r.x_tweet_id),
    xPostedAt: s(r.x_posted_at),
    error: s(r.error),
    xError: s(r.x_error),
    threadParts: arr(r.thread_parts),
    threadTweetIds: arr(r.thread_tweet_ids),
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

/**
 * X連続投稿（スレッド）を予約する（migration 0096）。
 *
 * 会社紹介・お知らせ・採用など「1本のツイートでは説明しきれない発信」用。
 * platform='x' 固定＝Instagramには配信しない（IG用のカード画像を作る前提が無いため）。
 *
 * status:
 *   'scheduled'          … 承認なしで予定時刻に自動投稿（Xの既定運用 #104と同じ思想）
 *   'awaiting_approval'  … 判断フィードで承認してから投稿（x_auto が有効だと承認前でも流れる点に注意）
 *
 * 予定時刻を過ぎていれば、次の10分tickでそのまま投稿される（PCを開いている必要はない）。
 */
export async function insertThread(
  admin: AdminClient,
  input: {
    companyId: string;
    product?: Product;
    theme: string;
    hook: string;
    parts: string[];
    scheduledAt: string;
    status?: "awaiting_approval" | "scheduled";
    hashtags?: string[];
    source?: Record<string, unknown>;
  }
): Promise<string | null> {
  const parts = input.parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const { data } = await admin
    .from("cnt_posts")
    .insert({
      company_id: input.companyId,
      product: input.product ?? "yozan",
      platform: "x",
      theme: input.theme,
      hook: input.hook.slice(0, 30),
      // body は一覧・承認カードでの表示用（実際に投稿されるのは thread_parts の各要素）
      body: parts.join("\n\n"),
      hashtags: input.hashtags ?? [],
      status: input.status ?? "scheduled",
      scheduled_at: input.scheduledAt,
      thread_parts: parts,
      source: { ...(input.source ?? {}), kind: "thread", parts: parts.length },
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
  /** 1チャネル以上に配信できた投稿数 */
  posted: number;
  /** 設定済みチャネルを試して全滅した投稿数 */
  failed: number;
  /** チャネル別の成功数（内訳表示用） */
  instagram: number;
  x: number;
  /** うち承認を待たずにXへ自動投稿した本数（#104） */
  xAuto: number;
  /** うち連続投稿（スレッド）として最後まで投稿しきった本数（0096） */
  threads: number;
  skipped?: string; // どのチャネルも未設定
};

/** 進捗ゼロのtickを何回まで許すか（10分tick × 6 = 約1時間）。半端に公開されたスレッドを諦めない上限 */
const THREAD_STALL_LIMIT = 6;

/** 商品 → X本文に貼る集客LPのパス（Xは本文リンクが踏める＝IGのbio誘導と役割が違う） */
const LP_PATH: Record<string, string> = {
  pganote: "/lp/pganote",
  "swing-cortex": "/lp/swing-cortex",
  webdesign: "/lp/webdesign",
};

/** X本文に載せるLP URL。?src=x は流入元の識別用（@yozan/track のセッションに残る） */
function lpUrlFor(product: string, baseUrl: string): string | null {
  const path = LP_PATH[product];
  return path ? `${baseUrl}${path}?src=x` : null;
}

/**
 * 予定時刻を過ぎた scheduled を Instagram と X の両方へ配信する（10分cronから）。
 *
 * - Instagram … 商品ごとのアカウント（igConfigForProduct）。カード画像＋キャプション
 * - X         … 会社公式1アカウント @YOZAN_inc。本文＋LPリンク直貼り（280重み以内に自動短縮）
 *
 * 状態の決め方（migration 0093 のコメントと対応）:
 *   1チャネルでも成功 → posted ／ 設定済みチャネルが全滅 → failed ／ 全未設定 → scheduled のまま
 * 片方だけ設定済みでも安全に動く（未設定チャネルは注記のみでエラーにしない）。
 */
export async function publishDue(
  admin: AdminClient,
  companyId: string,
  opts: { cardBaseUrl: string; limit?: number; xAuto?: boolean }
): Promise<PublishSummary> {
  const nowIso = new Date().toISOString();
  // xAuto のときは承認待ちの行も拾う（Xだけ先に出す）。Instagramは従来どおり承認済みのみ
  const statuses = opts.xAuto ? ["scheduled", "awaiting_approval"] : ["scheduled"];
  const { data: rows } = await admin
    .from("cnt_posts")
    .select(SELECT_POST)
    .eq("company_id", companyId)
    .in("status", statuses)
    .lte("scheduled_at", nowIso)
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(opts.limit ?? 3);
  const due = (rows ?? []) as Row[];
  const summary: PublishSummary = { due: due.length, posted: 0, failed: 0, instagram: 0, x: 0, xAuto: 0, threads: 0 };
  if (due.length === 0) return summary;

  const xCfg: XConfig | null = xConfigFromEnv();
  let anyConfigured = false;

  for (const r of due) {
    const post = toPost(r);
    const approved = post.status === "scheduled"; // 承認済みか（未承認でXだけ自動投稿するケースがある）
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let succeeded = 0;
    let attempted = 0;
    /** スレッドが途中まで進んだ＝失敗ではなく「次tickで続き」。status を動かさない */
    let deferred = false;

    // platform='x' はX専用（会社紹介スレッドなど、IGに出す絵が無い投稿）。IGは最初から対象外
    const xOnly = post.platform === "x";
    const isThread = post.threadParts.length > 0;

    // ---- Instagram（承認済みのみ。承認前は触らない）----
    const ig: IgConfig | null = approved && !xOnly ? igConfigForProduct(post.product) : null;
    if (approved && !xOnly && !ig) {
      const envs =
        post.product === "webdesign"
          ? "IG_ACCESS_TOKEN_WEB / IG_BUSINESS_ID_WEB（@yozan_web_jp）"
          : "IG_ACCESS_TOKEN / IG_BUSINESS_ID（@swingcortex_jp）";
      patch.error = `${envs} 未設定（Vercel envに設定すると自動投稿されます）`;
    } else if (ig) {
      anyConfigured = true;
      attempted += 1;
      try {
        const { mediaId } = await publishImagePost(ig, {
          imageUrl: `${opts.cardBaseUrl}/api/public/ai-sales/card/${post.id}`,
          caption: buildCaption(post.body, post.hashtags),
        });
        patch.ig_media_id = mediaId;
        patch.error = null;
        succeeded += 1;
        summary.instagram += 1;
      } catch (e) {
        patch.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      }
    }

    // ---- X（xAuto なら承認を待たない。既に投稿済みなら二重投稿しない）----
    // スレッドは「全部投げ終わるまで」未完了扱い。進捗は thread_tweet_ids の長さそのもの
    const threadRemaining = isThread ? post.threadParts.length - post.threadTweetIds.length : 0;
    const xDue = (isThread ? threadRemaining > 0 : !post.xTweetId) && (approved || Boolean(opts.xAuto));
    if (xDue && !xCfg) {
      patch.x_error = "X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET 未設定（@YOZAN_inc）";
    } else if (xDue && xCfg && isThread) {
      anyConfigured = true;
      attempted += 1;

      // 連続投稿。途中で落ちても投げられたぶんのIDは必ず積む＝次tickがそこから再開する
      const res = await publishThread(xCfg, post.threadParts, post.threadTweetIds);
      const allIds = [...post.threadTweetIds, ...res.tweetIds];
      if (res.tweetIds.length > 0) {
        patch.thread_tweet_ids = allIds;
        patch.x_tweet_id = allIds[0]; // 先頭＝スレッドの入口URL（既存UIのリンクはこの列を見る）
      }
      if (res.done) {
        patch.x_posted_at = post.xPostedAt ?? new Date().toISOString();
        patch.x_error = null;
        succeeded += 1;
        summary.x += 1;
        summary.threads += 1;
        if (!approved) summary.xAuto += 1;
      } else {
        patch.x_error = (res.error ?? "スレッド未完了").slice(0, 500);
        // 半端に公開されたスレッドは必ず完成させたい。進捗ゼロのtickが続いても一定回数は失敗扱いにしない。
        // 一度も投稿できていない（＝公開されていない）場合は、単発投稿と同じく素直に失敗にする
        const stalls = res.tweetIds.length > 0 ? 0 : Number(post.source.thread_stalls ?? 0) + 1;
        patch.source = { ...post.source, thread_stalls: stalls };
        deferred = allIds.length > 0 && stalls < THREAD_STALL_LIMIT;
      }
    } else if (xDue && xCfg) {
      anyConfigured = true;
      attempted += 1;

      // 画像を付ける（Xは画像付きの方が伸びる #104）。落ちても本文だけで投稿する＝投稿自体は守る
      let mediaIds: string[] | undefined;
      let mediaNote = "";
      try {
        const { mediaId } = await uploadMedia(xCfg, `${opts.cardBaseUrl}/api/public/ai-sales/card/${post.id}`);
        mediaIds = [mediaId];
      } catch (e) {
        mediaNote = `（画像なしで投稿: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}）`;
      }

      try {
        const { tweetId } = await publishTweet(
          xCfg,
          buildTweetText({
            body: post.body,
            hashtags: post.hashtags,
            url: lpUrlFor(post.product, opts.cardBaseUrl),
          }),
          mediaIds
        );
        patch.x_tweet_id = tweetId;
        patch.x_posted_at = new Date().toISOString();
        patch.x_error = mediaNote || null;
        succeeded += 1;
        summary.x += 1;
        if (!approved) summary.xAuto += 1;
      } catch (e) {
        patch.x_error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      }
    }

    // ---- 状態確定 ----
    // 承認前（Xだけ自動投稿）の行は status を動かさない＝Instagramの承認カードはそのまま残す
    if (approved) {
      if (succeeded > 0) {
        patch.status = "posted";
        patch.posted_at = post.postedAt ?? new Date().toISOString();
        summary.posted += 1;
      } else if (attempted > 0 && !deferred) {
        patch.status = "failed";
        summary.failed += 1;
      }
      // deferred（スレッド途中）は scheduled のまま＝次の10分tickが続きを投稿する
      // attempted === 0（全チャネル未設定）は scheduled のまま＝env設定後の次tickで自動投稿される
    }

    await admin.from("cnt_posts").update(patch).eq("id", post.id);
  }

  if (!anyConfigured) summary.skipped = "no_channel_configured";
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
