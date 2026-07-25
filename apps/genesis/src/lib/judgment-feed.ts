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
  | "reserve"; // res_requests pending（reserve-os）

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

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));

export async function getJudgmentFeed(companyId: string): Promise<JudgmentItem[]> {
  const admin = createAdmin();

  const [queueRes, delivRes, inqRes, trialRes, joinRes, resvRes] = await Promise.all([
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
  ]);

  const items: JudgmentItem[] = [];

  for (const r of (queueRes.data ?? []) as Row[]) {
    const type = s(r.action_type) ?? "";
    const isUndo = s(r.status) === "queued";
    // 外部送信系は承認前に文面をカード上で確認できるようにする（#79）
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    const bodyPreview = String(payload.body ?? payload.message ?? "").trim().slice(0, 160) || null;
    items.push({
      id: String(r.id),
      source: isUndo ? "undo" : "queue",
      tag: ACTION_TYPE_LABEL[type] ?? "AI実行",
      title: s(r.title) ?? type,
      detail: isUndo ? "実行予定（取消可）" : bodyPreview,
      createdAt: s(r.created_at),
      href: "/executions",
      scheduledAt: s(r.scheduled_at),
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

  // 判断SLA（#78）: 24時間以上放置は stale フラグ＋最上位へ昇格
  const staleLine = new Date(Date.now() - 24 * 3600_000).toISOString();
  for (const it of items) {
    if (it.source !== "undo" && it.createdAt && it.createdAt < staleLine) it.stale = true;
  }
  // undo（実行予定）→ stale（放置）→ 古い順
  items.sort((a, b) => {
    if ((a.source === "undo") !== (b.source === "undo")) return a.source === "undo" ? -1 : 1;
    if (Boolean(a.stale) !== Boolean(b.stale)) return a.stale ? -1 : 1;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });
  return items;
}
