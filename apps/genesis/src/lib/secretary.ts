import "server-only";
import { createAdmin } from "@/lib/supabase/admin";

/* ============================================================
   CEO AI 秘書（Secretary）— 問い合わせ受信箱のドメインロジック
   正典: docs/genesis/VISION.md §1（朝の報告）/ §7（承認の線引き）
   役割: メール等の問い合わせを「確認・承認」できる状態で提示する。
   返信の外部送信は承認必須。カレンダー登録は自動方針（DECISIONS参照）。
   実際の取得/送信/登録はエンジン（定期タスク or 将来のOAuth連携）が担う。
   ============================================================ */

export type InquiryType = "system_request" | "apparel" | "b2b" | "other" | "noise";

/** 問い合わせ種別の表示ラベル（YOZANの想定業務） */
export const INQUIRY_TYPE_LABELS: Record<InquiryType, string> = {
  system_request: "システム作成依頼",
  apparel: "アパレル商品問い合わせ",
  b2b: "業者間取引",
  other: "その他",
  noise: "ノイズ",
};

export const INQUIRY_STATUS_LABELS: Record<string, string> = {
  new: "新規",
  awaiting_approval: "承認待ち",
  approved: "承認済み（送信予約）",
  replied: "返信済み",
  scheduled: "予定登録済み",
  dismissed: "保留",
};

export type SecInquiry = {
  id: string;
  inquiry_type: InquiryType;
  priority: string;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string | null;
  ai_summary: string | null;
  ai_draft_reply: string | null;
  proposed_event: ProposedEvent | null;
  status: string;
  handled_by_agent: string;
  gmail_thread_id: string | null;
  calendar_event_id: string | null;
  reply_sent_at: string | null;
  created_at: string;
};

export type ProposedEvent = {
  title?: string;
  start?: string;
  end?: string;
  location?: string;
  notes?: string;
};

/** 未対応（新規・承認待ち）の問い合わせを新しい順で取得 */
export async function getOpenInquiries(companyId: string): Promise<SecInquiry[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sec_inquiries")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["new", "awaiting_approval"])
    .order("priority", { ascending: true })
    .order("received_at", { ascending: false })
    .limit(50);
  return (data ?? []) as SecInquiry[];
}

/** 処理済み（承認済み・返信済み・予定登録・保留）を直近で取得 */
export async function getRecentHandledInquiries(companyId: string): Promise<SecInquiry[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sec_inquiries")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["approved", "replied", "scheduled", "dismissed"])
    .order("updated_at", { ascending: false })
    .limit(20);
  return (data ?? []) as SecInquiry[];
}

export type InquiryStats = {
  open: number; // new + awaiting_approval
  awaitingApproval: number; // 返信の承認待ち
  byType: Record<string, number>; // 未対応の種別内訳
  scheduledToday: number; // 本日カレンダー登録済み
};

/** CEO AIレポート・Cockpitサマリ用の集計 */
export async function getInquiryStats(companyId: string): Promise<InquiryStats> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sec_inquiries")
    .select("inquiry_type, status, ai_draft_reply, calendar_event_id, updated_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["new", "awaiting_approval"]);

  const rows = data ?? [];
  const byType: Record<string, number> = {};
  let awaitingApproval = 0;
  for (const r of rows) {
    const t = String(r.inquiry_type);
    byType[t] = (byType[t] ?? 0) + 1;
    if (r.status === "awaiting_approval" && r.ai_draft_reply) awaitingApproval++;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: scheduledToday } = await admin
    .from("sec_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .not("calendar_event_id", "is", null)
    .gte("updated_at", todayStart.toISOString());

  return { open: rows.length, awaitingApproval, byType, scheduledToday: scheduledToday ?? 0 };
}

/** 日次レポート用のテキスト行（VISION §3の型に差し込む） */
export async function summarizeInquiriesForReport(companyId: string): Promise<string[]> {
  const stats = await getInquiryStats(companyId);
  if (stats.open === 0) return ["- 未対応の問い合わせなし"];
  const typeParts = Object.entries(stats.byType)
    .map(([t, n]) => `${INQUIRY_TYPE_LABELS[t as InquiryType] ?? t} ${n}件`)
    .join(" / ");
  const lines = [`- 未対応 ${stats.open}件（${typeParts}）`];
  if (stats.awaitingApproval > 0) {
    lines.push(`- うち返信承認待ち ${stats.awaitingApproval}件 → CEO Inboxで文面を確認・承認`);
  }
  if (stats.scheduledToday > 0) {
    lines.push(`- 本日カレンダー自動登録 ${stats.scheduledToday}件`);
  }
  return lines;
}
