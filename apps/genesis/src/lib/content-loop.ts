import { createAdmin } from "@/lib/supabase/admin";
import { enqueueAction } from "@/lib/ai-execution";
import { logEvent } from "@/lib/kernel";
import { jstYmd } from "@/lib/jst";
import { applyLearnedRules } from "@/lib/feedback";
import { generatePost, buildCaption, WEB_TOPICS } from "@yozan/content/generate";
import {
  listRecentThemes,
  pickMaterial,
  insertDraft,
  attachQueue,
  syncRejected,
  publishDue,
  contentStats,
  refreshXMetrics,
  type PublishSummary,
  type MetricsSummary,
} from "@yozan/content/server";
import type { Material, SalesProduct } from "@yozan/content/types";
import { PRODUCT_LABEL } from "@yozan/content/types";

type Admin = ReturnType<typeof createAdmin>;

/**
 * SNSインバウンド・コンテンツループ（DESIGN.md チャネルC / DECISIONS #101）
 *
 * 観測: 直近21日の投稿テーマ（重複回避）＋SWING CORTEX知識資産
 * 生成: 毎朝1本、PGA NOTE / SWING CORTEX を日替わりで投稿案を生成
 * 実行: ai_action_queue(sns_post, approval) → ホーム判断フィードで文面確認・修正 → 承認
 *        → 予定時刻（18:00 JST）に10分cron（/api/cron/execute → publishDueContent）がIGへ自動投稿
 * 記録: gn_loop_runs（1日1回）・月曜は週次ファネルレポートを company_events へ
 *
 * ⚠ コールドDMはこのループに含めない（完全自動の合法ルートなし・DESIGN.md §3-B）。
 */

const LOOP_CODE = "sns_content";

/** SNS集客の主体は株式会社YOZAN（PGA NOTE / SWING CORTEXの販売元）。他社テナントでは既定OFF */
const YOZAN_COMPANY_ID = "ec00ad2a-4032-4061-bdb7-03face8a04e7";

export const GENESIS_BASE_URL = "https://yozan-genesis.vercel.app";

type LoopRow = { id: string; enabled: boolean; config: Record<string, unknown> };

async function ensureLoop(admin: Admin, companyId: string): Promise<LoopRow | null> {
  const { data } = await admin
    .from("gn_loops")
    .select("id, enabled, config")
    .eq("company_id", companyId)
    .eq("code", LOOP_CODE)
    .maybeSingle();
  if (data) return data as LoopRow;
  const { data: inserted } = await admin
    .from("gn_loops")
    .insert({
      company_id: companyId,
      code: LOOP_CODE,
      name: "営業: SNSインバウンド投稿",
      enabled: companyId === YOZAN_COMPANY_ID,
      // 商品ローテーション（日替わり）。pganote は専用IGアカウントがまだ無いため既定から外している
      // （@swingcortex_jp に混ぜたくなったら config.products に追加するだけ）
      // x_auto: Xは承認を待たず予定時刻に自動投稿（#104）。Instagramは承認が要る（画像＋商品別アカウントのため）
      config: { post_hour_jst: 18, products: ["swing-cortex", "webdesign"], x_auto: true },
    })
    .select("id, enabled, config")
    .single();
  return (inserted as LoopRow) ?? null;
}

/** 投稿予定時刻: 今日の post_hour(JST)。cronは朝6時に走るので通常は当日。過ぎていたら翌日 */
function nextPostTime(postHourJst: number): string {
  const today = jstYmd();
  const candidate = new Date(`${today}T${String(postHourJst).padStart(2, "0")}:00:00+09:00`);
  if (candidate.getTime() < Date.now() + 30 * 60_000) {
    candidate.setTime(candidate.getTime() + 24 * 3600_000);
  }
  return candidate.toISOString();
}

/** 日替わりで商品を交互に（偶数日=PGA NOTE / 奇数日=SWING CORTEX） */
function productOfDay(config: Record<string, unknown>): SalesProduct {
  const products = (Array.isArray(config.products) ? config.products : ["swing-cortex", "webdesign"]) as SalesProduct[];
  const day = Number(jstYmd().slice(8, 10));
  return products[day % products.length] ?? "swing-cortex";
}

export async function runContentLoop(companyId: string): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  const loop = await ensureLoop(admin, companyId);
  if (!loop) return { skipped: "loop_init_failed" };
  if (loop.enabled === false) return { skipped: "disabled" };

  // 掃除: 却下された承認カードに紐づく投稿を rejected に同期
  await syncRejected(admin, companyId).catch(() => 0);

  const today = jstYmd();
  const { data: existing } = await admin
    .from("gn_loop_runs")
    .select("id")
    .eq("loop_id", loop.id)
    .eq("run_date", today)
    .maybeSingle();

  // 月曜は週次ファネルレポート（生成の前に。既に走った日でも二重にならないようexistingで抑止）
  const isMonday = new Date(`${today}T00:00:00+09:00`).getUTCDay() === 1;
  if (isMonday && !existing) {
    await weeklyFunnelReport(admin, companyId).catch(() => null);
  }

  if (existing) return { skipped: "already_ran_today" };

  const cfg = loop.config ?? {};
  const product = productOfDay(cfg);
  const postHour = Number(cfg.post_hour_jst ?? 18);
  const scheduledAt = nextPostTime(postHour);

  const saveRun = async (decision: "act" | "skip", reason: string, deliverable: string | null, queueId: string | null) => {
    await admin.from("gn_loop_runs").insert({
      company_id: companyId,
      loop_id: loop.id,
      run_date: today,
      observed: { product, scheduled_at: scheduledAt },
      decision,
      reason,
      deliverable,
      action_queue_id: queueId,
    });
  };

  // ---- 題材選定（直近テーマは回避）----
  // ゴルフ系＝SWING CORTEX資産（sc_*）、HP制作＝パッケージ内の題材リスト（WEB_TOPICS）
  const recent = await listRecentThemes(admin, companyId, 21).catch(() => []);
  let material: Material | null;
  if (product === "webdesign") {
    const avoid = new Set(recent);
    const pool = WEB_TOPICS.filter((t) => !avoid.has(t.symptomName));
    const source = pool.length > 0 ? pool : WEB_TOPICS; // 全部使い切ったら一周して再利用
    material = source[Math.floor(Math.random() * source.length)] ?? null;
  } else {
    material = await pickMaterial(admin, companyId, recent);
  }
  if (!material) {
    await saveRun("skip", "題材が見つかりません（sc_symptoms/sc_knowledgeが空か、直近と全て重複）", null, null);
    return { decision: "skip", reason: "no_material" };
  }

  // ---- 生成（Claude→テンプレfallback）＋学習ルール適用（0090） ----
  const gen = await generatePost(product, material);
  const { body, appliedRules } = await applyLearnedRules(admin, companyId, "sns_post", gen.body).catch(() => ({
    body: gen.body,
    appliedRules: [] as string[],
  }));
  gen.body = body;

  const postId = await insertDraft(admin, {
    companyId,
    product,
    gen,
    scheduledAt,
    source: { sc_symptom_id: material.symptomId, symptom: material.symptomName, applied_rules: appliedRules },
  });
  if (!postId) {
    await saveRun("skip", "cnt_posts への保存に失敗", null, null);
    return { decision: "skip", reason: "insert_failed" };
  }

  // ---- 承認カード（判断フィード）へ ----
  const timeLabel = new Date(scheduledAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const enq = await enqueueAction(admin, {
    companyId,
    actionType: "sns_post",
    title: `SNS AI: Instagram＋X投稿（${PRODUCT_LABEL[product]}）「${gen.theme}」→ ${timeLabel} 予定`,
    payload: {
      post_id: postId,
      product,
      hook: gen.hook,
      body: gen.body,
      hashtags: gen.hashtags,
      scheduled_for: scheduledAt,
      caption_preview: buildCaption(gen.body, gen.hashtags).slice(0, 400),
    },
    originKind: "content_loop",
    dedupeKey: `sns-content-${today}`,
    createdBy: null,
  });
  if (enq.id) await attachQueue(admin, postId, enq.id);

  await saveRun("act", `${PRODUCT_LABEL[product]} の投稿案を生成（${gen.generator}）`, gen.body, enq.id);
  await logEvent(companyId, {
    event_type: "ai.sns_content",
    title: `SNS AIが${PRODUCT_LABEL[product]}の投稿案を生成 →「${gen.theme}」（承認待ち・${timeLabel}投稿予定）`,
    source: "content_loop",
    source_type: "ai",
  });
  return { decision: "act", product, post_id: postId, queued: enq };
}

/**
 * 予定時刻を過ぎた投稿を Instagram と X の両方へ（/api/cron/execute の10分tickから・#103）。
 * IGは商品別アカウント、Xは会社公式1アカウント @YOZAN_inc。片方未設定でももう片方は配信される。
 */
/**
 * Xの反応数を取り込む（日次cronから1日1回・#108）。
 *
 * 10分tickではなく日次にしているのは料金のため。Owned Reads は $0.001/件・UTC日内は重複課金なしなので、
 * 「1日1回、直近30日ぶんをタイムラインから一括で取る」が一番安い（月$1未満）。
 * ユーザーIDの取得は $0.010 と割高なので gn_loops.config.x_user_id に焼いて2回目以降は叩かない。
 */
export async function refreshContentMetrics(admin: Admin, companyId: string): Promise<MetricsSummary> {
  const { data: loop } = await admin
    .from("gn_loops")
    .select("config")
    .eq("company_id", companyId)
    .eq("code", LOOP_CODE)
    .maybeSingle();
  const config = (loop?.config ?? {}) as Record<string, unknown>;
  const cached = config.x_user_id ? String(config.x_user_id) : null;

  const summary = await refreshXMetrics(admin, companyId, {
    userId: cached,
    onUserId: async (id: string) => {
      await admin
        .from("gn_loops")
        .update({ config: { ...config, x_user_id: id } })
        .eq("company_id", companyId)
        .eq("code", LOOP_CODE);
    },
  });

  if (summary.error) {
    await logEvent(companyId, {
      event_type: "ai.sns_metrics_failed",
      title: `Xの反応数を取得できませんでした: ${summary.error}`,
      source: "content_loop",
      source_type: "ai",
      severity: "warning",
    });
  }
  return summary;
}

export async function publishDueContent(admin: Admin, companyId: string): Promise<PublishSummary> {
  // Xは承認なしで自動投稿（#104・gn_loops.config.x_auto）。Instagramは従来どおり承認が要る
  const { data: loop } = await admin
    .from("gn_loops")
    .select("config")
    .eq("company_id", companyId)
    .eq("code", LOOP_CODE)
    .maybeSingle();
  const xAuto = (loop?.config as Record<string, unknown> | undefined)?.x_auto !== false;

  const summary = await publishDue(admin, companyId, { cardBaseUrl: GENESIS_BASE_URL, xAuto });
  if (summary.xAuto > 0) {
    await logEvent(companyId, {
      event_type: "ai.sns_posted",
      title: `SNS AIが承認なしでXへ${summary.xAuto}件自動投稿しました（Instagramは承認待ちのまま）`,
      source: "content_loop",
      source_type: "ai",
    });
  }
  if (summary.posted > 0) {
    const detail = [
      summary.instagram > 0 ? `Instagram ${summary.instagram}件` : null,
      summary.x > 0 ? `X ${summary.x}件` : null,
    ]
      .filter(Boolean)
      .join(" / ");
    await logEvent(companyId, {
      event_type: "ai.sns_posted",
      title: `SNS AIがSNSへ${summary.posted}件投稿しました（${detail}）`,
      source: "content_loop",
      source_type: "ai",
    });
  }
  if (summary.failed > 0) {
    await logEvent(companyId, {
      event_type: "ai.sns_post_failed",
      title: `SNS投稿に${summary.failed}件失敗（/ai-sales で理由を確認）`,
      source: "content_loop",
      source_type: "ai",
      severity: "warning",
    });
  }
  return summary;
}

/** LPリンク（trk_links）のID群。resource_type='lp' はホットリード通知の対象外（匿名の公開ページのため） */
export async function lpLinkIds(admin: Admin, companyId: string): Promise<string[]> {
  const { data } = await admin
    .from("trk_links")
    .select("id")
    .eq("company_id", companyId)
    .eq("resource_type", "lp")
    .is("deleted_at", null);
  return ((data ?? []) as { id: string }[]).map((r) => String(r.id));
}

/** 週次ファネルレポート: 投稿→LP閲覧→リード を1本のイベントに（月曜朝・ホームのティッカーへ） */
async function weeklyFunnelReport(admin: Admin, companyId: string): Promise<void> {
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const stats = await contentStats(admin, companyId, 7);

  const linkIds = await lpLinkIds(admin, companyId);
  let lpViews = 0;
  if (linkIds.length > 0) {
    const { count } = await admin
      .from("trk_sessions")
      .select("id", { count: "exact", head: true })
      .in("link_id", linkIds)
      .eq("is_internal", false)
      .gte("started_at", since);
    lpViews = count ?? 0;
  }

  // リード: PGA NOTE（sales_os）＋ SWING CORTEX（sec_inquiries source='lp'）
  let pnLeads = 0;
  try {
    const salesOs = (admin as unknown as { schema: (s: string) => Admin }).schema("sales_os");
    const { data: proj } = await salesOs.from("projects").select("id").eq("code", "PN").maybeSingle();
    if (proj) {
      const { count } = await salesOs
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("project_id", proj.id)
        .gte("created_at", since);
      pnLeads = count ?? 0;
    }
  } catch {
    /* sales_os未接続でもレポートは出す */
  }
  const { count: scLeads } = await admin
    .from("sec_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("source", "lp")
    .gte("received_at", since);

  await logEvent(companyId, {
    event_type: "ai.content_weekly",
    title: `SNS営業 週次: 投稿${stats.posted}件 → LP閲覧${lpViews}回 → 新規リード${pnLeads + (scLeads ?? 0)}件（PGA NOTE ${pnLeads}・SWING CORTEX ${scLeads ?? 0}）`,
    description: `生成${stats.generated}件 / 投稿${stats.posted}件 / 失敗${stats.failed}件。詳細は /ai-sales`,
    source: "content_loop",
    source_type: "ai",
  });
}
