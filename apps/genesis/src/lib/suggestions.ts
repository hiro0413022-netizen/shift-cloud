import "server-only";
import { jstYmd } from "@/lib/jst";
import { createAdmin } from "@/lib/supabase/admin";
import { getCockpitData, getBusinessBreakdown, type CockpitData } from "@/lib/kernel";
import { runKpiIntegrityChecks } from "@/lib/kpi-checks";
import { getInquiryStats } from "@/lib/secretary";

/* ============================================================
   改善提案エンジン（DECISIONS #52 / 2026-07-14）
   これまで ai_suggestions は器だけで0件＝「提案」が事実上存在しなかった。
   ここで毎日「実データから導ける改善提案」を生成し、Cockpitの一等地に出す。

   設計:
   - ルールベース（決定的・無料）＋ Claude（実データを読ませた発想）のハイブリッド。
     APIキーが無くてもルールベースで必ず出る。
   - dedupe_key で同じ提案の重複生成を防ぐ（0045のunique index）。
   - 各提案は「そのまま実行指示にできる」suggested_action を必ず持つ（→ /directives）。
   ============================================================ */

export type Suggestion = {
  id: string;
  kind: string; // sales / cost / ops / risk / data / member
  severity: string; // high / medium / low
  title: string;
  body: string | null;
  suggested_action: string | null;
  impact: string | null;
  effort: string | null;
  href: string | null;
  source: string | null;
  approval_status: string | null;
  execution_status: string | null;
  dismissed_at: string | null;
  created_at: string;
};

/** severityはDBのenum suggestion_severity（info/warning/critical）に合わせる。
 *  UI表示は critical=最優先 / warning=推奨 / info=余力があれば。 */
export type Severity = "critical" | "warning" | "info";

type Draft = {
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  suggested_action: string;
  impact?: string;
  effort?: string;
  href?: string;
  dedupe_key: string;
  source: string;
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export const SEVERITY_LABELS: Record<string, string> = {
  critical: "最優先",
  warning: "推奨",
  info: "余力があれば",
};

export const SUGGESTION_KIND_LABELS: Record<string, string> = {
  sales: "売上",
  member: "会員",
  cost: "コスト",
  ops: "運営",
  risk: "リスク",
  data: "データ",
};

/** 未対応の改善提案（重要度順） */
export async function getOpenSuggestions(companyId: string, limit = 20): Promise<Suggestion[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("ai_suggestions")
    .select("*")
    .eq("company_id", companyId)
    .is("dismissed_at", null)
    .neq("execution_status", "executed")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as Suggestion[];
  return rows.sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
  );
}

/* ---------- ルールベース（決定的・説明可能） ---------- */
function ruleDrafts(d: CockpitData, ctx: { openInquiries: number; integrity: number; forecastOnly: boolean }): Draft[] {
  const out: Draft[] = [];
  const kpi = (code: string) => d.kpis.find((k) => k.code === code);
  const num = (v: unknown) => (v == null ? null : Number(v));

  const trial = kpi("trial_bookings");
  const tv = num(trial?.current_value);
  const tt = num(trial?.target_value);
  if (tv != null && tt != null && tv < tt) {
    const gap = tt - tv;
    out.push({
      kind: "sales",
      severity: gap >= tt * 0.5 ? "critical" : "warning",
      title: `体験予約が目標に${gap}件不足（${tv}/${tt}件）`,
      body: "体験からの入会が会員数の生命線。今月の体験予約が目標を下回っているため、集客導線を今週中に増やす必要がある。",
      suggested_action:
        "①公式LINEのリッチメニューに「体験予約」を追加（member-os /intake へ誘導）②Instagram/LINEで体験レッスン訴求を週2本 ③過去の体験未入会者に再アプローチのDM",
      impact: `体験予約 +${gap}件/月 → 入会 +${Math.max(1, Math.round(gap * 0.5))}名`,
      effort: "1〜2日",
      href: "/future",
      dedupe_key: `trial_gap_${new Date().toISOString().slice(0, 7)}`,
      source: "rules",
    });
  }

  const conv = kpi("conversion_rate");
  const cv = num(conv?.current_value);
  if (cv != null && cv === 0 && tv != null && tv > 0) {
    out.push({
      kind: "member",
      severity: "critical",
      title: "入会率0% — 体験後のフォローが仕組みになっていない",
      body: "体験予約はあるのに入会が計上されていない。体験当日のクロージング手順と、翌日フォロー連絡が運用に載っていない可能性が高い。",
      suggested_action:
        "体験当日に「入会案内シート」を渡す→翌日にLINEでフォロー、を店舗の標準手順にする（スタッフのやることリストへ配信）",
      impact: "入会率 +20〜30pt",
      effort: "すぐ",
      href: "/",
      dedupe_key: `conv_zero_${new Date().toISOString().slice(0, 7)}`,
      source: "rules",
    });
  }

  const churn = kpi("churn_rate");
  const chv = num(churn?.current_value);
  const cht = num(churn?.target_value);
  if (chv != null && cht != null && chv > cht) {
    out.push({
      kind: "member",
      severity: "warning",
      title: `退会率が目標超過（${chv}% / 目標${cht}%）`,
      body: "退会理由の記録が集まれば打ち手が specific になる。まずは退会時の理由ヒアリングを必須化する。",
      suggested_action:
        "退会申し出時に理由を必ず記録（Smart Hello/会員名簿）→ 月次で理由別集計 → 上位2理由に対する改善を実施",
      impact: `退会率 -${(chv - cht).toFixed(1)}pt = 月会費の維持`,
      effort: "継続",
      href: "/",
      dedupe_key: `churn_over_${new Date().toISOString().slice(0, 7)}`,
      source: "rules",
    });
  }

  const ratio = kpi("labor_cost_ratio");
  const rv = num(ratio?.current_value);
  const rt = num(ratio?.target_value);
  if (rv != null && rt != null && rv > rt) {
    out.push({
      kind: "cost",
      severity: "warning",
      title: `人件費率が目標超過（${rv}% / 目標${rt}%）`,
      body: "来週シフトの過剰配置を点検すれば、その月のうちに効く。",
      suggested_action: "来週分のシフトを人時売上高で点検し、閑散時間帯の重複配置を1枠減らす",
      impact: `人件費 ${Math.round((rv - rt) * 1000)}円/月 規模の圧縮`,
      effort: "すぐ",
      href: "/",
      dedupe_key: `labor_ratio_${new Date().toISOString().slice(0, 7)}`,
      source: "rules",
    });
  }

  if (ctx.openInquiries >= 3) {
    out.push({
      kind: "ops",
      severity: "warning",
      title: `お客様からの問い合わせが${ctx.openInquiries}件未返信`,
      body: "LINE/メールの問い合わせが溜まると、そのまま退会理由になる。返信案は自動生成済みなので、承認するだけで送れる。",
      suggested_action: "CEO Inboxで返信案を確認し、承認して送信する（1件30秒）",
      impact: "顧客満足・退会抑止",
      effort: "すぐ",
      href: "/inbox",
      dedupe_key: `inbox_backlog_${jstYmd()}`,
      source: "rules",
    });
  }

  if (ctx.integrity > 0) {
    out.push({
      kind: "data",
      severity: "critical",
      title: `数字の整合性エラー${ctx.integrity}件 — 経営判断の土台が不正確`,
      body: "KPIチェッカーが矛盾を検知している。この状態のKPIで判断すると誤った打ち手になる。",
      suggested_action: "Money OSで当月の経費・売上を取り込み、KPIを再集計する",
      impact: "全KPIの信頼性",
      effort: "1日",
      href: "/finance",
      dedupe_key: `integrity_${jstYmd()}`,
      source: "rules",
    });
  }

  for (const b of d.blockers) {
    out.push({
      kind: "risk",
      severity: "critical",
      title: `ブロッカー: ${String(b.title)}`,
      body: b.needs != null ? `解消条件: ${String(b.needs)}` : "解消の判断が止まっている。",
      suggested_action: "担当者に解消期限を切って指示を出す",
      effort: "要判断",
      href: "/dev",
      dedupe_key: `blocker_${String(b.id)}`,
      source: "rules",
    });
  }

  return out;
}

/* ---------- Claude（実データを読ませた発想） ---------- */
async function claudeDrafts(d: CockpitData, businessText: string): Promise<Draft[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const snapshot = [
    "## KPI",
    ...d.kpis.map(
      (k) =>
        `${k.name}: ${k.current_value ?? "未接続"}${k.unit}${k.target_value != null ? ` / 目標${k.target_value}${k.unit}` : ""}`
    ),
    "## 事業別",
    businessText,
    "## リスク/ブロッカー",
    ...d.risks.map((r) => `[${r.severity}] ${r.title}`),
    ...d.blockers.map((b) => `[blocker] ${b.title}`),
  ].join("\n");

  const system = [
    "あなたはYOZAN（インドアゴルフ GOLF WING が本丸／アパレル KALLINOS／キャディ派遣）のCEO AI。",
    "実データだけを根拠に、今週すぐ着手できる改善提案を作る。一般論・精神論・「検討する」で終わる提案は禁止。",
    "各提案は必ず「誰が何をいつまでに」まで具体化する。数字の裏付けがない提案は出さない。",
    '出力は次のJSONのみ: {"suggestions":[{"kind":"sales|member|cost|ops|risk|data","severity":"critical|warning|info","title":"20〜40字","body":"根拠を2文以内で","suggested_action":"具体的な実行手順1〜3ステップ","impact":"効果の見立て（数字）","effort":"すぐ|1日|継続"}]}',
    "提案は最大4件。既にKPIが目標を達成している領域には提案しない。",
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.CEO_AI_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: `本日の経営データ:\n${snapshot}` }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]) as { suggestions?: Partial<Draft>[] };
    const week = weekKey();
    return (parsed.suggestions ?? [])
      .filter((s) => s.title && s.suggested_action)
      .slice(0, 4)
      .map((s) => ({
        kind: String(s.kind ?? "ops"),
        severity: (["critical", "warning", "info"].includes(String(s.severity)) ? String(s.severity) : "warning") as Severity,
        title: String(s.title),
        body: String(s.body ?? ""),
        suggested_action: String(s.suggested_action),
        impact: s.impact != null ? String(s.impact) : undefined,
        effort: s.effort != null ? String(s.effort) : undefined,
        href: "/",
        dedupe_key: `claude_${week}_${hash(String(s.title))}`,
        source: "claude",
      }));
  } catch {
    return [];
  }
}

function weekKey(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}W${week}`;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/** 改善提案を生成して保存（重複は dedupe_key で自然に無視される）。戻り値: 新規件数 */
export async function generateSuggestions(companyId: string): Promise<number> {
  const admin = createAdmin();
  const [d, business, stats] = await Promise.all([
    getCockpitData(companyId),
    getBusinessBreakdown(companyId).catch(() => null),
    getInquiryStats(companyId).catch(() => ({ open: 0 } as { open: number })),
  ]);
  const integrity = await runKpiIntegrityChecks(companyId, d.kpis).catch(() => []);

  const businessText = business
    ? business.segments
        .map((s) => `${s.name}: 売上${s.revenue.toLocaleString("ja-JP")}円 / 利益${s.profit.toLocaleString("ja-JP")}円`)
        .join("\n")
    : "（財務データなし）";

  const drafts = [
    ...ruleDrafts(d, { openInquiries: stats.open, integrity: integrity.length, forecastOnly: false }),
    ...(await claudeDrafts(d, businessText)),
  ];

  let created = 0;
  for (const s of drafts) {
    const { error } = await admin.from("ai_suggestions").insert({
      company_id: companyId,
      kind: s.kind,
      severity: s.severity,
      title: s.title,
      body: s.body,
      suggested_action: s.suggested_action,
      impact: s.impact ?? null,
      effort: s.effort ?? null,
      href: s.href ?? null,
      dedupe_key: s.dedupe_key,
      source: s.source,
      approval_status: "pending",
      execution_status: "not_executed",
    });
    if (!error) created++;
  }
  return created;
}
