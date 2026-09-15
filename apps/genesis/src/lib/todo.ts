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
import { panelKey } from "@/lib/home-pure";

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
};

export type HomeData = {
  cockpit: CockpitData;
  score: GenesisScore;
  todos: TodoEntry[];
  undo: JudgmentItem[];
  stalled: StalledItem[];
  feed: JudgmentItem[];
  alerts: AlertItem[];
};

export async function getHomeData(actor: GenesisActor): Promise<HomeData> {
  const scope = storeScope(actor);
  const [d, suggestions, feed, ackedKeys, stalledAll] = await Promise.all([
    getCockpitData(actor.companyId, scope),
    getOpenSuggestions(actor.companyId, 3).catch(() => []),
    getJudgmentFeed(actor.companyId, scope).catch(() => [] as JudgmentItem[]),
    getAckedAlertKeys(actor.companyId).catch(() => new Set<string>()),
    getStalledItems(actor.companyId).catch(() => [] as StalledItem[]),
  ]);
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
  alerts.slice(0, 7).forEach((j, i) => {
    todos.push({
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
    todos.push({
      key: panelKey("suggestion", String(sg.id)),
      source: "suggestion",
      tag: "改善提案",
      title: sg.title,
      detail: sg.impact ?? sg.suggested_action ?? null,
      href: "/suggestions",
      suggestion: sg,
    });
  }
  return { cockpit: d, score, todos, undo, stalled, feed, alerts };
}
