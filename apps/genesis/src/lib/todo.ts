import "server-only";
import type { GenesisActor } from "@/lib/auth";
import { storeScope } from "@/lib/auth";
import {
  getCockpitData,
  computeGenesisScore,
  applyJudgmentPenalties,
  buildJudgmentList,
  alertKey,
  getAckedAlertKeys,
  type JudgmentItem as AlertItem,
  type CockpitData,
  type GenesisScore,
} from "@/lib/kernel";
import { runKpiIntegrityChecks } from "@/lib/kpi-checks";
import { runLegalChecks } from "@/lib/legal-checks";
import { getOpenSuggestions } from "@/lib/suggestions";
import { getJudgmentFeed, type JudgmentItem } from "@/lib/judgment-feed";
import { getStalledItems, type StalledItem } from "@/lib/stalled";
import { panelKey, sortByInboxCategory } from "@/lib/home-pure";
import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@/lib/jst";

/** データの点検（整合性・法務・KPI）と改善提案を「今日やること」に混ぜる日。毎月1〜3日だけ（#246） */
export function isMonthlyCheckDay(today: string = jstYmd()): boolean {
  return Number(today.slice(8, 10)) <= 3;
}

/**
 * 「今日やること」の1行（#244 ③）。
 * 承認リクエスト・判断フィード・アラート・改善提案という4系統を1つの型に揃える。
 * ホームの一覧・右パネル・/todo・JARVISの読み上げが全部これを使う＝件数と並びが必ず一致する。
 */
export type TodoEntry = {
  key: string; // ?panel= に載せるキー（source:id）
  source: "approval" | "alert" | "suggestion" | JudgmentItem["source"];
  tag: string;
  title: string;
  detail: string | null;
  href: string | null;
  stale?: boolean;
  /** 元データ（パネルで詳細を出す用） */
  feed?: JudgmentItem;
  approval?: Record<string, unknown>;
  alert?: AlertItem;
  suggestion?: { id: string; title: string; impact?: string | null; suggested_action?: string | null };
  /** Inbox 4分類（#292）。表示は sortByInboxCategory が付ける */
  severity?: string | null;
  kind?: string | null;
};

export type HomeData = {
  cockpit: CockpitData;
  score: GenesisScore;
  todos: TodoEntry[];
  /** #246: 月次の点検（整合性・法務・KPI・改善提案）。毎月1〜3日か ?checks=1 のときだけ todos に混ざる */
  checks: TodoEntry[];
  undo: JudgmentItem[];
  stalled: StalledItem[];
  feed: JudgmentItem[];
  alerts: AlertItem[];
};

export async function getHomeData(actor: GenesisActor, opts: { includeChecks?: boolean; storeIds?: string[] | null } = {}): Promise<HomeData> {
  // Focus（#305）: 店舗に絞っていれば KPI・承認・判断フィードもその店だけ。権限の範囲（storeScope）を超えない
  const base = storeScope(actor);
  const scope = opts.storeIds && opts.storeIds.length ? opts.storeIds.filter((id) => !base || base.includes(id)) : base;
  const [d, suggestions, feed, ackedKeys, stalledAll] = await Promise.all([
    getCockpitData(actor.companyId, scope),
    getOpenSuggestions(actor.companyId, 3).catch(() => []),
    getJudgmentFeed(actor.companyId, scope).catch(() => [] as JudgmentItem[]),
    getAckedAlertKeys(actor.companyId).catch(() => new Set<string>()),
    getStalledItems(actor.companyId).catch(() => [] as StalledItem[]),
  ]);
  // Proactive（gn_rules）と Waiting（gn_waiting）の起票は「今日やること」に常に出す（月次点検の枠ではない・#292）
  const proactive = await createAdmin()
    .from("ai_suggestions")
    .select("id, kind, severity, title, body, suggested_action, href, created_at")
    .eq("company_id", actor.companyId)
    .in("kind", ["proactive", "waiting"])
    .eq("approval_status", "pending")
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(20)
    .then((r) => (r.data ?? []) as Array<{ id: string; kind: string; severity: string; title: string; body: string | null; suggested_action: string | null; href: string | null }>, () => []);
  const [integrity, legal] = await Promise.all([
    runKpiIntegrityChecks(actor.companyId, d.kpis).catch(() => []),
    runLegalChecks(actor.companyId).catch(() => []),
  ]);
  const alerts = [...integrity, ...legal, ...buildJudgmentList(d)]
    .filter((j) => j.kind !== "approval")
    .filter((j) => !ackedKeys.has(alertKey(j)));
  const stalled = stalledAll.filter((s) => !ackedKeys.has(s.key));
  const score = applyJudgmentPenalties(computeGenesisScore(d), alerts);

  const undo = feed.filter((f) => f.source === "undo");
  const todos: TodoEntry[] = [];
  for (const a of d.approvals) {
    todos.push({
      key: panelKey("approval", String(a.id)),
      source: "approval",
      tag: "承認",
      title: String(a.title ?? a.kind ?? "承認リクエスト"),
      detail: a.description != null ? String(a.description) : null,
      href: "/approvals",
      approval: a,
    });
  }
  for (const f of feed.filter((f) => f.source !== "undo")) {
    todos.push({ key: panelKey(f.source, f.id), source: f.source, tag: f.tag, title: f.title, detail: f.detail, href: f.href, stale: f.stale, feed: f });
  }
  for (const p of proactive) {
    todos.push({
      key: panelKey("suggestion", String(p.id)),
      source: "suggestion",
      tag: p.kind === "waiting" ? "待ち" : "見つけた",
      title: p.title,
      detail: p.suggested_action ?? (p.body ? p.body.split("\n")[0] : null),
      href: p.href ?? "/suggestions",
      suggestion: { id: p.id, title: p.title, suggested_action: p.suggested_action },
      severity: p.severity,
      kind: p.kind,
    });
  }
  const checks: TodoEntry[] = [];
  alerts.slice(0, 7).forEach((j, i) => {
    checks.push({
      key: panelKey("alert", String(i)),
      source: "alert",
      tag: j.kind === "risk" ? "リスク" : j.kind === "blocker" ? "ブロッカー" : "確認",
      title: j.title,
      detail: j.detail ?? null,
      href: j.href,
      alert: j,
    });
  });
  for (const sg of suggestions as { id: string; title: string; impact?: string | null; suggested_action?: string | null }[]) {
    checks.push({
      key: panelKey("suggestion", String(sg.id)),
      source: "suggestion",
      tag: "改善提案",
      title: sg.title,
      detail: sg.impact ?? sg.suggested_action ?? null,
      href: "/suggestions",
      suggestion: sg,
    });
  }
  // #246 ユーザー指摘「データ検証からの修正までが早すぎる。月次でいい」「修正項目が多すぎる」
  // → 点検と改善提案は毎月1〜3日だけ今日やることに混ぜ、それ以外の日は1行のリンクにする
  const merged = sortByInboxCategory(opts.includeChecks || isMonthlyCheckDay() ? [...todos, ...checks] : todos);
  return { cockpit: d, score, todos: merged, checks, undo, stalled, feed, alerts };
}
