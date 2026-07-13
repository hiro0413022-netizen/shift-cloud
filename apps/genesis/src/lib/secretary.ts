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
  source: string; // line / gmail / manual
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

/** 未対応（新規・承認待ち）の問い合わせを新しい順で取得。
 *  受信フィルタ（リッチメニュー等）は先に適用してから返す＝「対応要件」に混ざらない（0045）。 */
export async function getOpenInquiries(companyId: string): Promise<SecInquiry[]> {
  await applyFilterRules(companyId).catch(() => 0);
  const admin = createAdmin();
  const { data } = await admin
    .from("sec_inquiries")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["new", "awaiting_approval"])
    .neq("inquiry_type", "noise")
    .order("priority", { ascending: true })
    .order("received_at", { ascending: false })
    .limit(50);
  return (data ?? []) as SecInquiry[];
}

/* ============================================================
   受信フィルタ（0045 / DECISIONS #52）
   LINEのリッチメニュー押下は message イベントとして届くため、
   そのままだと「未対応の問い合わせ」を占拠する（2026-07-14: 15件中10件が「プロの出勤情報」）。
   会員は自分で出勤情報を見る運用なので、AI/古川さんの対応要件ではない。
   文言はDBで持ち、/inbox から追加・削除できる（新しいリッチメニューを作っても追随できる）。
   ============================================================ */

export type FilterRule = {
  id: string;
  source: string; // line / gmail / any
  pattern: string;
  match_type: "exact" | "contains" | "prefix";
  label: string | null;
  action: "noise" | "low";
  active: boolean;
  hits: number;
  last_hit_at: string | null;
};

export async function getFilterRules(companyId: string): Promise<FilterRule[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sec_filter_rules")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return (data ?? []) as FilterRule[];
}

function ruleMatches(rule: FilterRule, text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (rule.match_type === "exact") return t === rule.pattern;
  if (rule.match_type === "prefix") return t.startsWith(rule.pattern);
  return t.includes(rule.pattern);
}

/** 未処理の問い合わせにフィルタを適用。noise は対応不要（dismissed）へ、low は優先度を下げる。
 *  戻り値: 除外した件数 */
export async function applyFilterRules(companyId: string): Promise<number> {
  const admin = createAdmin();
  const rules = (await getFilterRules(companyId)).filter((r) => r.active);
  if (rules.length === 0) return 0;

  const { data: rows } = await admin
    .from("sec_inquiries")
    .select("id, source, snippet, subject, status, inquiry_type")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["new", "awaiting_approval"])
    .neq("inquiry_type", "noise");

  let filtered = 0;
  const now = new Date().toISOString();
  for (const q of rows ?? []) {
    const text = String(q.snippet ?? q.subject ?? "");
    const rule = rules.find((r) => (r.source === "any" || r.source === String(q.source)) && ruleMatches(r, text));
    if (!rule) continue;

    if (rule.action === "noise") {
      await admin
        .from("sec_inquiries")
        .update({ status: "dismissed", inquiry_type: "noise", filtered_by_rule: rule.id, updated_at: now })
        .eq("id", q.id);
      filtered++;
    } else {
      await admin.from("sec_inquiries").update({ priority: "low", filtered_by_rule: rule.id }).eq("id", q.id);
    }
    await admin
      .from("sec_filter_rules")
      .update({ hits: (rule.hits ?? 0) + 1, last_hit_at: now })
      .eq("id", rule.id);
    rule.hits = (rule.hits ?? 0) + 1;
  }
  return filtered;
}

/* ============================================================
   返信文の起案（Claude）— 承認を押すだけで送れる状態にする
   外部送信は承認必須（VISION §7）。ここは「下書きを作る」までで送信はしない。
   ============================================================ */

const REPLY_SYSTEM = [
  "あなたはYOZAN（インドアゴルフ GOLF WING／アパレル KALLINOS 等を運営）の代表・古川さんの秘書です。",
  "受け取った問い合わせに対する返信文の下書きを日本語で書きます。",
  "文体: 丁寧・簡潔・具体的。前置きの美辞麗句は不要。3〜6文程度。",
  "LINEの場合は硬すぎない、店舗スタッフからの返信として自然な文面（宛名なし・改行少なめ）。",
  "メールの場合は「〇〇様」で始め、末尾に「YOZAN」の署名を付ける。",
  "分からない事実（料金・在庫・空き状況・個別の予約状況）は断定せず、確認して折り返す旨を書く。",
  "謝罪が必要な場面では簡潔に謝意を示し、次のアクション（いつ・誰が・何をするか）を明示する。",
  "出力は返信本文のみ。前置き・説明・マークダウン記法は書かない。",
].join("\n");

/** 1件分の返信案を生成して保存（既存の下書きは上書きする）。APIキーが無ければ null。 */
export async function generateDraftReply(companyId: string, inquiryId: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const admin = createAdmin();
  const { data: q } = await admin
    .from("sec_inquiries")
    .select("*")
    .eq("id", inquiryId)
    .eq("company_id", companyId)
    .single();
  if (!q) return null;
  if (!apiKey) return null;

  const channel = String(q.source) === "line" ? "LINE（GOLF WING公式アカウント）" : "メール";
  const user = [
    `## チャネル: ${channel}`,
    `## 差出人: ${q.from_name ?? q.from_email ?? "不明"}`,
    `## 件名: ${q.subject ?? "（なし）"}`,
    "## 本文",
    String(q.snippet ?? ""),
    "",
    "上記への返信文の下書きを書いてください。",
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.CEO_AI_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: REPLY_SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    if (!text) return null;

    const summary =
      String(q.ai_summary ?? "") ||
      `${String(q.from_name ?? q.from_email ?? "お客様")}より「${String(q.snippet ?? "").slice(0, 30)}」の件で問い合わせが入っています`;
    await admin
      .from("sec_inquiries")
      .update({
        ai_draft_reply: text,
        ai_summary: summary,
        status: q.status === "new" ? "awaiting_approval" : q.status,
        draft_generated_at: new Date().toISOString(),
      })
      .eq("id", inquiryId);
    return text;
  } catch {
    return null;
  }
}

/** 未対応で返信案が無いものに、まとめて下書きを作る（日次レポート時に自動実行。最大件数で保護） */
export async function generateMissingDrafts(companyId: string, limit = 8): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;
  const admin = createAdmin();
  const { data: rows } = await admin
    .from("sec_inquiries")
    .select("id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["new", "awaiting_approval"])
    .neq("inquiry_type", "noise")
    .is("ai_draft_reply", null)
    .limit(limit);

  let made = 0;
  for (const r of rows ?? []) {
    const t = await generateDraftReply(companyId, String(r.id));
    if (t) made++;
  }
  return made;
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
    .in("status", ["new", "awaiting_approval"])
    .neq("inquiry_type", "noise");

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
