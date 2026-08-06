import "server-only";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * AI営業司令室（/ai-sales）のライブデータ組み立て（#101）。
 * 「AIがいま何をしているか」を1画面に: 投稿パイプライン・ファネル・活動フィード。
 * クエリ失敗は画面全体を壊さず、その系統を空にする（judgment-feedと同方針）。
 */

type Admin = ReturnType<typeof createAdmin>;
type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));

/**
 * cnt_posts.metrics から画面に出す反応数を取り出す（#108）。
 * スレッドは連投全体の合計（metrics.x_thread）を優先する — 入口だけ見ると返信に付いた反応が消えるため。
 */
function pickReactions(metrics: unknown): LivePost["reactions"] {
  const m = (metrics ?? {}) as Record<string, unknown>;
  const src = (m.x_thread ?? m.x) as Record<string, unknown> | null | undefined;
  if (!src) return null;
  const n = (v: unknown) => Number(v ?? 0);
  return {
    likes: n(src.likes),
    reposts: n(src.reposts),
    replies: n(src.replies),
    impressions: src.impressions == null ? null : Number(src.impressions),
  };
}

export type ActivityItem = {
  at: string;
  icon: string;
  tag: string;
  text: string;
  href?: string | null;
};

export type LivePost = {
  id: string;
  product: string;
  hook: string;
  theme: string | null;
  status: string;
  scheduledAt: string | null;
  postedAt: string | null;
  error: string | null;
  /** チャネル別の結果（#103。1投稿をIG・Xの両方へ配信する） */
  igPosted: boolean;
  xPosted: boolean;
  xUrl: string | null;
  xError: string | null;
  /** 連投（スレッド）のとき、本数と投稿済み本数（0096）。単発投稿は parts=0 */
  threadParts: number;
  threadPosted: number;
  /** Xの反応数（#108・日次cronで取得）。スレッドは連投全体の合計 */
  reactions: { likes: number; reposts: number; replies: number; impressions: number | null } | null;
};

export type AiSalesLive = {
  generatedAt: string;
  config: {
    igConfigured: boolean;
    igWebConfigured: boolean;
    /** X（@YOZAN_inc）のキー4つが揃っているか */
    xConfigured: boolean;
    aiConfigured: boolean;
    loopEnabled: boolean | null;
    /** Xは承認なしで自動投稿するか（#104・gn_loops.config.x_auto） */
    xAuto: boolean;
  };
  lastRun: { date: string; decision: string; reason: string } | null;
  pipeline: {
    awaiting: number;
    scheduled: number;
    posted30d: number;
    failed: number;
    nextScheduledAt: string | null;
  };
  funnel: {
    posts30d: number;
    lpViews30d: number;
    leads30d: number;
    deals: number;   // Sales OS: 商談ステージ（現在）
    adopted: number; // Sales OS: 導入ステージ（累計）
    demoHot: number; // demo-sales: 開封済み・未対応のホットリード
  };
  posts: LivePost[];
  activity: ActivityItem[];
};

const PRODUCT_SHORT: Record<string, string> = { pganote: "PGA NOTE", "swing-cortex": "SWING CORTEX", webdesign: "HP制作" };

export async function getAiSalesLive(companyId: string): Promise<AiSalesLive> {
  const admin = createAdmin();
  const since30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  const safe = async <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };

  // ---- LPリンク（trk）----
  const lpLinks = await safe(
    admin
      .from("trk_links")
      .select("id, token, label")
      .eq("company_id", companyId)
      .eq("resource_type", "lp")
      .is("deleted_at", null)
      .then((r) => (r.data ?? []) as Row[]),
    []
  );
  const lpIds = lpLinks.map((l) => String(l.id));
  const lpLabel = new Map(lpLinks.map((l) => [String(l.id), String(l.label ?? "LP")]));

  const [
    postsRes,
    loopRes,
    runRes,
    counts,
    lpViews30,
    lpRecent,
    demoHotRes,
    inqRes,
    eventsRes,
  ] = await Promise.all([
    safe(
      admin
        .from("cnt_posts")
        .select(
          "id, product, hook, theme, status, scheduled_at, posted_at, error, ig_media_id, x_tweet_id, x_posted_at, x_error, thread_parts, thread_tweet_ids, metrics, created_at"
        )
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10)
        .then((r) => (r.data ?? []) as Row[]),
      []
    ),
    safe(
      admin
        .from("gn_loops")
        .select("id, enabled, config")
        .eq("company_id", companyId)
        .eq("code", "sns_content")
        .maybeSingle()
        .then((r) => r.data as Row | null),
      null
    ),
    safe(
      admin
        .from("gn_loop_runs")
        .select("run_date, decision, reason, created_at")
        .eq("company_id", companyId)
        .order("run_date", { ascending: false })
        .limit(3)
        .then((r) => (r.data ?? []) as Row[]),
      []
    ),
    // パイプラインの状態別件数
    Promise.all(
      (["awaiting_approval", "scheduled", "failed"] as const).map((st) =>
        safe(
          admin
            .from("cnt_posts")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("status", st)
            .is("deleted_at", null)
            .then((r) => r.count ?? 0),
          0
        )
      )
    ),
    lpIds.length === 0
      ? Promise.resolve(0)
      : safe(
          admin
            .from("trk_sessions")
            .select("id", { count: "exact", head: true })
            .in("link_id", lpIds)
            .eq("is_internal", false)
            .gte("started_at", since30)
            .then((r) => r.count ?? 0),
          0
        ),
    lpIds.length === 0
      ? Promise.resolve([] as Row[])
      : safe(
          admin
            .from("trk_sessions")
            .select("link_id, started_at, seconds, device, referrer")
            .in("link_id", lpIds)
            .eq("is_internal", false)
            .order("started_at", { ascending: false })
            .limit(10)
            .then((r) => (r.data ?? []) as Row[]),
          []
        ),
    safe(
      admin
        .from("trk_links")
        .select("id, label, app, last_viewed_at, view_count, notified_at, first_viewed_at")
        .eq("company_id", companyId)
        .eq("app", "demo-sales")
        .is("deleted_at", null)
        .not("first_viewed_at", "is", null)
        .order("last_viewed_at", { ascending: false })
        .limit(8)
        .then((r) => (r.data ?? []) as Row[]),
      []
    ),
    safe(
      admin
        .from("sec_inquiries")
        .select("from_name, subject, received_at")
        .eq("company_id", companyId)
        .eq("source", "lp")
        .is("deleted_at", null)
        .order("received_at", { ascending: false })
        .limit(6)
        .then((r) => (r.data ?? []) as Row[]),
      []
    ),
    safe(
      admin
        .from("company_events")
        .select("event_type, title, occurred_at, created_at")
        .eq("company_id", companyId)
        .in("source", ["content_loop", "ai_sales_lp"])
        .order("created_at", { ascending: false })
        .limit(8)
        .then((r) => (r.data ?? []) as Row[]),
      []
    ),
  ]);

  // ---- Sales OS（PGA NOTE）: スキーマ分離のため try/catch で読む ----
  let pnLeads30 = 0;
  let deals = 0;
  let adopted = 0;
  let pnRecent: Row[] = [];
  try {
    const salesOs = admin.schema("sales_os");
    const { data: proj } = await salesOs.from("projects").select("id").eq("code", "PN").maybeSingle();
    if (proj) {
      const { data: stages } = await salesOs
        .from("pipeline_stages")
        .select("id, name")
        .eq("project_id", proj.id);
      const stageId = (name: string) => ((stages ?? []) as Row[]).find((x) => String(x.name) === name)?.id;
      const [a, b, c, d] = await Promise.all([
        salesOs.from("leads").select("id", { count: "exact", head: true }).eq("project_id", proj.id).gte("created_at", since30),
        stageId("商談")
          ? salesOs.from("leads").select("id", { count: "exact", head: true }).eq("project_id", proj.id).eq("stage_id", stageId("商談"))
          : Promise.resolve({ count: 0 }),
        stageId("導入")
          ? salesOs.from("leads").select("id", { count: "exact", head: true }).eq("project_id", proj.id).eq("stage_id", stageId("導入"))
          : Promise.resolve({ count: 0 }),
        salesOs
          .from("leads")
          .select("title, created_at")
          .eq("project_id", proj.id)
          .gte("created_at", since30)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      pnLeads30 = a.count ?? 0;
      deals = (b as { count?: number }).count ?? 0;
      adopted = (c as { count?: number }).count ?? 0;
      pnRecent = ((d as { data?: Row[] }).data ?? []) as Row[];
    }
  } catch {
    /* sales_os が読めなくても画面は出す */
  }

  const posted30 = await safe(
    admin
      .from("cnt_posts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "posted")
      .gte("posted_at", since30)
      .is("deleted_at", null)
      .then((r) => r.count ?? 0),
    0
  );
  const nextSched = await safe(
    admin
      .from("cnt_posts")
      .select("scheduled_at")
      .eq("company_id", companyId)
      .in("status", ["awaiting_approval", "scheduled"])
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then((r) => s((r.data as Row | null)?.scheduled_at)),
    null
  );

  const inq30 = inqRes.filter((r) => String(r.received_at ?? "") >= since30).length;

  // ---- 活動フィード（時系列 union）----
  const activity: ActivityItem[] = [];
  for (const p of postsRes) {
    const label = PRODUCT_SHORT[String(p.product)] ?? String(p.product);
    activity.push({
      at: String(p.created_at),
      icon: "📝",
      tag: "生成",
      text: `${label}の投稿案「${s(p.hook) ?? s(p.theme) ?? ""}」を作成`,
    });
    if (p.posted_at && p.ig_media_id) {
      activity.push({ at: String(p.posted_at), icon: "📸", tag: "投稿", text: `${label}をInstagramへ投稿` });
    }
    if (p.x_posted_at) {
      activity.push({
        at: String(p.x_posted_at),
        icon: "𝕏",
        tag: "投稿",
        text: `${label}をX（@YOZAN_inc）へ投稿`,
        href: p.x_tweet_id ? `https://x.com/YOZAN_inc/status/${String(p.x_tweet_id)}` : null,
      });
    }
    if (String(p.status) === "failed" && p.error) {
      activity.push({ at: String(p.created_at), icon: "⚠️", tag: "失敗", text: `Instagram投稿失敗: ${String(p.error).slice(0, 60)}` });
    }
    if (p.x_error && !p.x_posted_at && String(p.status) !== "scheduled") {
      activity.push({ at: String(p.created_at), icon: "⚠️", tag: "失敗", text: `X投稿失敗: ${String(p.x_error).slice(0, 60)}` });
    }
  }
  for (const v of lpRecent) {
    const secs = Number(v.seconds ?? 0);
    activity.push({
      at: String(v.started_at),
      icon: "👀",
      tag: "LP閲覧",
      text: `${lpLabel.get(String(v.link_id)) ?? "LP"}が閲覧されました（${String(v.device ?? "?")}・${secs}秒）`,
    });
  }
  for (const h of demoHotRes) {
    activity.push({
      at: s(h.last_viewed_at) ?? s(h.first_viewed_at) ?? "",
      icon: "🔥",
      tag: "デモ開封",
      text: `${s(h.label) ?? "先方"}が営業デモを開きました（${Number(h.view_count ?? 0)}回）`,
    });
  }
  for (const q of inqRes) {
    activity.push({
      at: String(q.received_at),
      icon: "📨",
      tag: "リード",
      text: `${s(q.from_name) ?? "匿名"} — ${s(q.subject) ?? "問い合わせ"}`,
    });
  }
  for (const l of pnRecent) {
    activity.push({ at: String(l.created_at), icon: "🤝", tag: "リード", text: `Sales OSに登録: ${s(l.title) ?? ""}` });
  }
  for (const r of runRes) {
    activity.push({
      at: s(r.created_at) ?? `${String(r.run_date)}T06:00:00+09:00`,
      icon: "🤖",
      tag: "AI判断",
      text: `${String(r.decision) === "act" ? "投稿を起案" : "スキップ"}: ${s(r.reason) ?? ""}`,
    });
  }
  for (const e of eventsRes) {
    if (String(e.event_type ?? "").startsWith("ai.sns") || String(e.event_type) === "ai.content_weekly") continue; // 上と重複しがちなものは間引く
    activity.push({ at: s(e.occurred_at) ?? String(e.created_at), icon: "⚡", tag: "イベント", text: String(e.title ?? "") });
  }
  activity.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return {
    generatedAt: new Date().toISOString(),
    config: {
      igConfigured: Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_BUSINESS_ID),
      igWebConfigured: Boolean(process.env.IG_ACCESS_TOKEN_WEB && process.env.IG_BUSINESS_ID_WEB),
      xConfigured: Boolean(
        process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET
      ),
      aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      loopEnabled: loopRes ? Boolean(loopRes.enabled) : null,
      xAuto: (loopRes?.config as Record<string, unknown> | undefined)?.x_auto !== false,
    },
    lastRun:
      runRes.length > 0
        ? { date: String(runRes[0].run_date), decision: String(runRes[0].decision), reason: s(runRes[0].reason) ?? "" }
        : null,
    pipeline: {
      awaiting: counts[0],
      scheduled: counts[1],
      failed: counts[2],
      posted30d: posted30,
      nextScheduledAt: nextSched,
    },
    funnel: {
      posts30d: posted30,
      lpViews30d: lpViews30,
      leads30d: pnLeads30 + inq30,
      deals,
      adopted,
      demoHot: demoHotRes.filter((h) => !h.notified_at).length,
    },
    posts: postsRes.map((p) => ({
      id: String(p.id),
      product: String(p.product),
      hook: String(p.hook ?? ""),
      theme: s(p.theme),
      status: String(p.status),
      scheduledAt: s(p.scheduled_at),
      postedAt: s(p.posted_at),
      error: s(p.error),
      igPosted: Boolean(p.ig_media_id),
      xPosted: Boolean(p.x_tweet_id),
      xUrl: p.x_tweet_id ? `https://x.com/YOZAN_inc/status/${String(p.x_tweet_id)}` : null,
      xError: s(p.x_error),
      threadParts: Array.isArray(p.thread_parts) ? (p.thread_parts as unknown[]).length : 0,
      threadPosted: Array.isArray(p.thread_tweet_ids) ? (p.thread_tweet_ids as unknown[]).length : 0,
      reactions: pickReactions(p.metrics),
    })),
    activity: activity.slice(0, 30),
  };
}
