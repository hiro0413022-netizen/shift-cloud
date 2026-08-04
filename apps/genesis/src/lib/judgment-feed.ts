import { createAdmin } from "@/lib/supabase/admin";

/**
 * 判断フィード（REDESIGN_2026-07 §3-1 / §5a）
 * 5系統＋他アプリの承認系を1本のフィードに統合する read 層。
 * - 既存テーブルは変更しない。書き込みは各系統の既存 server action（または feed-actions.ts）が行う。
 * - クエリ失敗はフィード全体を壊さず、その系統を空にする（他アプリのテーブル差異に耐える）。
 */

export type JudgmentSource =
  | "approval" // approval_requests
  | "queue" // ai_action_queue awaiting_approval
  | "undo" // ai_action_queue queued（実行予定・取消枠）
  | "deliverable" // ai_execution_logs review_status=pending
  | "suggestion" // ai_suggestions open
  | "inquiry" // sec_inquiries pending
  | "trial" // mbr_trial_requests pending（member-os）
  | "join" // frunk_members pending（member-os Web入会）
  | "reserve" // res_requests pending（reserve-os）
  | "hotlead"; // trk_links 初回開封・未対応（@yozan/track #95）

export type JudgmentItem = {
  id: string;
  source: JudgmentSource;
  tag: string;
  title: string;
  detail: string | null;
  createdAt: string | null;
  /** 詳細を見たい時の深リンク（nullならカード内で完結） */
  href: string | null;
  /** undo（実行予定）の実行予定時刻 */
  scheduledAt: string | null;
  /** inquiry: AI下書きがあり、その場で承認送信できるか */
  hasDraft?: boolean;
  /** 判断SLA（#78・REDESIGN §10-2）: 24時間以上放置されている */
  stale?: boolean;
  /** queue: 送信文の全文（LINE配信等。承認前に必ず全文を確認できるようにする） */
  body?: string | null;
  /** queue: 承認すると何がどう実行されるかの実行プラン（カードの「詳細」で表示） */
  plan?: ExecutionPlan | null;
  /** queue: 修正指示UIを出すか（awaiting_approval の文面系のみ） */
  revisable?: boolean;
};

/** 「承認すると何がどう実行されるか」の説明（ホームの詳細展開用） */
export type ExecutionPlan = {
  what: string; // 何をする
  target: string; // 誰に/どこへ
  timing: string; // いつ実行されるか
  irreversible: boolean; // 実行後に取り消せないか
};

const AGENT_LABEL: Record<string, string> = {
  sns_ai: "SNS AI",
  sales_ai: "営業AI",
  cs_ai: "顧客AI",
  docs_ai: "資料AI",
  ceo_ai: "CEO AI",
};

const ACTION_TYPE_LABEL: Record<string, string> = {
  staff_directive: "スタッフ連絡",
  line_broadcast: "LINE配信",
  sns_post: "SNS投稿",
  internal_notify: "社内通知",
  agent_directive: "AI指示",
  report_generate: "レポート",
  test_notify: "テスト",
};

// 外部アプリの深リンク（vault_systems が正典だが、フィード表示用に既知URLを保持）
const MEMBER_OS_URL = "https://member-os-tau.vercel.app";
const RESERVE_OS_URL = "https://shift-cloud-reserve-os.vercel.app";
const DEMO_SALES_URL = "https://demo-sales-delta.vercel.app";

// 計測アプリごとの表示（@yozan/track は汎用なので、ラベルと戻り先だけここで解決する）
const TRACK_APP: Record<string, { tag: string; verb: string; base: string }> = {
  "demo-sales": { tag: "デモ開封", verb: "が営業デモを開きました", base: DEMO_SALES_URL },
};

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));

/** action_type ごとの実行プランを組み立てる（承認前に「何がどう動くか」を言語化） */
function buildPlan(
  type: string,
  payload: Record<string, unknown>,
  channels: Map<string, string>,
  staffGroupCount: number
): ExecutionPlan | null {
  const cron = "承認後、最大10分以内（10分ごとの実行キュー）";
  if (type === "line_broadcast") {
    const code = String(payload.channel ?? "gw_visitor");
    const name = channels.get(code) ?? code;
    return {
      what: "LINE公式アカウントから一斉配信（broadcast）",
      target: `「${name}」の友だち全員`,
      timing: cron,
      irreversible: true,
    };
  }
  if (type === "staff_directive") {
    const target = String(payload.target ?? "") === "all"
      ? `スタッフLINEグループ 全${staffGroupCount}件`
      : payload.group_id
        ? "指定のスタッフLINEグループ 1件"
        : payload.store_id
          ? "指定店舗のスタッフLINEグループ"
          : "既定のスタッフLINEグループ 1件";
    return { what: "スタッフ用OAからLINEグループへ送信", target, timing: cron, irreversible: true };
  }
  if (type === "sns_post") {
    const product = String(payload.product ?? "");
    const label =
      product === "pganote" ? "PGA NOTE" : product === "swing-cortex" ? "SWING CORTEX" : product === "webdesign" ? "HP制作" : product;
    const when = payload.scheduled_for
      ? new Date(String(payload.scheduled_for)).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "予定時刻";
    return {
      what: `Instagramへフィード投稿（${label}の集客投稿・カード画像＋キャプション）`,
      target: product === "webdesign" ? "@yozan_web_jp のフォロワー・発見タブ" : "@swingcortex_jp のフォロワー・発見タブ",
      timing: `承認で予約確定 → ${when} に自動投稿（10分ごとの実行キュー）`,
      irreversible: true, // 投稿後の削除はInstagram側で手動
    };
  }
  if (type === "prod_deploy") {
    return {
      what: "Vercelデプロイフックを叩いて本番再デプロイ",
      target: `プロジェクト: ${String(payload.project ?? "未指定")}`,
      timing: cron,
      irreversible: false,
    };
  }
  if (type === "internal_notify" || type === "test_notify" || type === "agent_directive") {
    return { what: "社内記録のみ（外部送信なし）", target: "company_events（AIの動きログ）", timing: cron, irreversible: false };
  }
  if (type === "report_generate") {
    return { what: "CEO AI日次レポートを再生成", target: "社内（Genesis内のみ）", timing: cron, irreversible: false };
  }
  return null;
}

export async function getJudgmentFeed(companyId: string): Promise<JudgmentItem[]> {
  const admin = createAdmin();

  const [queueRes, delivRes, inqRes, trialRes, joinRes, resvRes, hotRes, chRes, grpRes] = await Promise.all([
    admin
      .from("ai_action_queue")
      .select("id, title, action_type, status, created_at, scheduled_at, payload")
      .eq("company_id", companyId)
      .in("status", ["awaiting_approval", "queued"])
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("ai_execution_logs")
      .select("id, task, agent_id, created_at")
      .eq("company_id", companyId)
      .eq("review_status", "pending")
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("sec_inquiries")
      .select("id, subject, from_name, ai_summary, ai_draft_reply, received_at")
      .eq("company_id", companyId)
      .in("status", ["new", "awaiting_approval"])
      .is("deleted_at", null)
      .order("received_at", { ascending: false })
      .limit(5),
    admin
      .from("mbr_trial_requests")
      .select("id, name, pref1, experience, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10),
    admin
      .from("frunk_members")
      .select("id, name, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10),
    admin
      .from("res_requests")
      .select("id, name, service_name, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(10),
    // ホットリード: 配った資料が開かれ、まだ対応していないもの（#95）
    admin
      .from("trk_links")
      .select("id, app, label, href, first_viewed_at, last_viewed_at, view_count, total_seconds")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .is("notified_at", null)
      .not("first_viewed_at", "is", null)
      .order("last_viewed_at", { ascending: false })
      .limit(10),
    // 実行プラン表示用: LINEチャネル名とスタッフグループ数
    admin.from("gn_line_channels").select("code, name").eq("company_id", companyId).eq("enabled", true),
    admin
      .from("gn_line_groups")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
  ]);

  const channels = new Map<string, string>(((chRes.data ?? []) as Row[]).map((c) => [String(c.code), String(c.name)]));
  const staffGroupCount = grpRes.count ?? 0;

  const items: JudgmentItem[] = [];

  for (const r of (queueRes.data ?? []) as Row[]) {
    const type = s(r.action_type) ?? "";
    const isUndo = s(r.status) === "queued";
    // 外部送信系は承認前に文面をカード上で確認できるようにする（#80）
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    const fullBody = String(payload.body ?? payload.message ?? "").trim() || null;
    const bodyPreview = fullBody ? fullBody.slice(0, 160) : null;
    items.push({
      id: String(r.id),
      source: isUndo ? "undo" : "queue",
      tag: ACTION_TYPE_LABEL[type] ?? "AI実行",
      title: s(r.title) ?? type,
      detail: isUndo ? "実行予定（取消可）" : bodyPreview,
      createdAt: s(r.created_at),
      href: "/executions",
      scheduledAt: s(r.scheduled_at),
      body: fullBody,
      plan: buildPlan(type, payload, channels, staffGroupCount),
      // 文面がある承認待ちのみ修正指示可（LINE配信・スタッフ連絡・SNS投稿 #101）
      revisable:
        !isUndo && fullBody != null && (type === "line_broadcast" || type === "staff_directive" || type === "sns_post"),
    });
  }

  for (const r of (delivRes.data ?? []) as Row[]) {
    items.push({
      id: String(r.id),
      source: "deliverable",
      tag: AGENT_LABEL[s(r.agent_id) ?? ""] ?? "成果物",
      title: (s(r.task) ?? "成果物").slice(0, 60),
      detail: "承認=下書き確定（配信はしない）",
      createdAt: s(r.created_at),
      href: "/deliverables",
      scheduledAt: null,
    });
  }

  for (const r of (inqRes.data ?? []) as Row[]) {
    items.push({
      id: String(r.id),
      source: "inquiry",
      tag: "問い合わせ",
      title: s(r.subject) ?? s(r.from_name) ?? "問い合わせ",
      detail: s(r.ai_summary),
      createdAt: s(r.received_at),
      href: "/inbox",
      scheduledAt: null,
      hasDraft: Boolean(String(r.ai_draft_reply ?? "").trim()),
    });
  }

  for (const r of (trialRes.data ?? []) as Row[]) {
    items.push({
      id: String(r.id),
      source: "trial",
      tag: "体験申込",
      title: `${s(r.name) ?? "お客様"} 様の体験申込`,
      detail: [s(r.pref1) && `第1希望: ${s(r.pref1)}`, s(r.experience)].filter(Boolean).join(" ・ ") || null,
      createdAt: s(r.created_at),
      href: `${MEMBER_OS_URL}/trials`,
      scheduledAt: null,
    });
  }

  for (const r of (joinRes.data ?? []) as Row[]) {
    items.push({
      id: String(r.id),
      source: "join",
      tag: "Web入会",
      title: `${s(r.name) ?? "お客様"} 様の入会申込（FRANK）`,
      detail: "承認すると会員番号を発行して在籍化します",
      createdAt: s(r.created_at),
      href: `${MEMBER_OS_URL}/frunk`,
      scheduledAt: null,
    });
  }

  for (const r of (resvRes.data ?? []) as Row[]) {
    items.push({
      id: String(r.id),
      source: "reserve",
      tag: "予約申込",
      title: `${s(r.name) ?? "お客様"} 様: ${s(r.service_name) ?? "予約"}`,
      detail: "日時確定・確定メールはreserve-osで実行",
      createdAt: s(r.created_at),
      href: `${RESERVE_OS_URL}/requests`,
      scheduledAt: null,
    });
  }

  for (const r of (hotRes.data ?? []) as Row[]) {
    const app = TRACK_APP[s(r.app) ?? ""] ?? { tag: "開封", verb: "が資料を開きました", base: "" };
    const href = s(r.href);
    const seconds = Number(r.total_seconds ?? 0);
    const mins = seconds >= 60 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${seconds}秒`;
    items.push({
      id: String(r.id),
      source: "hotlead",
      tag: app.tag,
      title: `${s(r.label) ?? "先方"}${app.verb}`,
      detail: `${Number(r.view_count ?? 0)}回・合計${mins}閲覧。開封直後の架電がもっとも繋がります`,
      // last_viewed_at を時刻とする（開封からの経過＝鮮度）
      createdAt: s(r.last_viewed_at) ?? s(r.first_viewed_at),
      href: href ? `${app.base}${href}` : null,
      scheduledAt: null,
    });
  }

  // 判断SLA（#78）: 24時間以上放置は stale フラグ＋最上位へ昇格
  const staleLine = new Date(Date.now() - 24 * 3600_000).toISOString();
  for (const it of items) {
    if (it.source !== "undo" && it.createdAt && it.createdAt < staleLine) it.stale = true;
  }
  // undo（実行予定・時間切れが近い）→ hotlead（鮮度が命）→ その他
  // hotlead だけは「新しい順」。開封直後ほど架電が繋がるため（#95）
  const rank = (it: JudgmentItem) => (it.source === "undo" ? 0 : it.source === "hotlead" ? 1 : 2);
  items.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    if (Boolean(a.stale) !== Boolean(b.stale)) return a.stale ? -1 : 1;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });
  return items;
}
