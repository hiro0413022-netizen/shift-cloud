import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { jstMonthStart } from "@/lib/jst";
import type { JudgmentItem } from "@/lib/kernel";

/* ============================================================
   KPI整合性チェッカー（AUDIT_2026-07-11 D-4 / B-2）
   目的: 「間違った数字でCEO AIが判断する」事故を止める。
   Claude API不要・SQL＋ルールのみ。日次cron(runDailyCeoReport)から呼ばれ、
   検知結果は「今日、古川さんが判断すべきこと」リストの先頭に合流する。

   チェック:
   1. 完了月なのに経費が0円（売上あり）→ 利益過大の疑い（例: 6月ゴルフ経費未入力）
   2. 完了月なのに予測値(source='forecast')が残存 → 実績未入力
   3. 売上の前月比が±50%超 → 入力漏れ/二重計上の疑い
   4. 5大KPIの目標値未設定 → スコア/判断リストが機能しない
   ============================================================ */

const CORE_KPI_CODES = ["monthly_sales", "members", "trial_bookings", "churn_rate", "labor_cost_ratio"];

/**
 * スコア減点の重み（DECISIONS #43）。
 * 数字の整合性違反＝「経営判断の土台が嘘」なので、ブロッカー(-10)より重い -12。
 * 目標未設定は1KPIあたり -4（5件全部なら -20）。
 */
const INTEGRITY_WEIGHT = 12;
const NO_TARGET_WEIGHT = 4;

type FinRow = {
  segment_id: string;
  target_month: string;
  amount: number;
  source: string;
  fin_categories: { kind: string; name: string } | null;
  fin_segments: { name: string } | null;
};

function monthStartUTC(offsetMonths: number): string {
  // JST基準の「当月」。UTCのままだと毎月1日の朝6時cron（=前月末日UTC）で
  // 当月判定が1か月ずれ、完了月チェックが誤検知する。
  return jstMonthStart(offsetMonths);
}

function ymLabel(dateStr: string): string {
  return `${dateStr.slice(0, 4)}年${Number(dateStr.slice(5, 7))}月`;
}

export async function runKpiIntegrityChecks(
  companyId: string,
  kpis: Array<Record<string, unknown>>
): Promise<JudgmentItem[]> {
  const admin = createAdmin();
  const items: JudgmentItem[] = [];

  // 直近6ヶ月の完了月（当月は対象外 — DECISIONS #32のヘッドライン方針と同じ）
  const currentMonthStart = monthStartUTC(0);
  const sixMonthsAgo = monthStartUTC(-6);

  const { data } = await admin
    .from("fin_entries")
    .select("segment_id, target_month, amount, source, fin_categories(kind, name), fin_segments(name)")
    .eq("company_id", companyId)
    .gte("target_month", sixMonthsAgo)
    .lt("target_month", currentMonthStart)
    .is("deleted_at", null);
  const rows = (data ?? []) as unknown as FinRow[];

  // (segment, month) ごとに revenue / cost を集計
  const byKey = new Map<
    string,
    { segName: string; month: string; revenue: number; cost: number; forecastAmount: number }
  >();
  for (const r of rows) {
    const key = `${r.segment_id}|${r.target_month}`;
    const cur =
      byKey.get(key) ??
      { segName: r.fin_segments?.name ?? "不明事業", month: r.target_month, revenue: 0, cost: 0, forecastAmount: 0 };
    const kind = r.fin_categories?.kind;
    if (kind === "revenue") cur.revenue += Number(r.amount);
    if (kind === "cogs" || kind === "expense") cur.cost += Number(r.amount);
    if (r.source === "forecast") cur.forecastAmount += Number(r.amount);
    byKey.set(key, cur);
  }

  // 1. 経費0円の完了月（売上あり）
  for (const v of byKey.values()) {
    if (v.revenue > 0 && v.cost === 0) {
      items.push({
        kind: "kpi",
        title: `⚠数字の整合性: ${ymLabel(v.month)}の${v.segName}経費が未入力です`,
        detail: `売上${Math.round(v.revenue).toLocaleString("ja-JP")}円に対し経費0円 → 利益が過大に見えています。Money OS/財務入力で経費を取り込んでください`,
        href: "/finance",
        weight: INTEGRITY_WEIGHT,
        scoreLabel: "数字の整合性",
      });
    }
  }

  // 2. 完了月に予測値が残存（実績が入っていない）
  for (const v of byKey.values()) {
    if (v.forecastAmount > 0) {
      items.push({
        kind: "kpi",
        title: `⚠数字の整合性: ${ymLabel(v.month)}の${v.segName}に予測値が残っています`,
        detail: `月会費等${Math.round(v.forecastAmount).toLocaleString("ja-JP")}円が予測(forecast)のまま。実績（ファイン等）を取り込むと自動で置換されます`,
        href: "/finance",
        weight: INTEGRITY_WEIGHT,
        scoreLabel: "数字の整合性",
      });
    }
  }

  // 3. 売上の前月比±50%超（直近完了月 vs その前月、両方>0のとき）
  const revByMonth = new Map<string, number>();
  for (const v of byKey.values()) {
    revByMonth.set(v.month, (revByMonth.get(v.month) ?? 0) + v.revenue);
  }
  const months = [...revByMonth.keys()].sort();
  if (months.length >= 2) {
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    const lastRev = revByMonth.get(last) ?? 0;
    const prevRev = revByMonth.get(prev) ?? 0;
    if (lastRev > 0 && prevRev > 0) {
      const ratio = lastRev / prevRev;
      if (ratio > 1.5 || ratio < 0.5) {
        items.push({
          kind: "kpi",
          title: `⚠数字の整合性: 売上が前月比${ratio > 1 ? "+" : ""}${Math.round((ratio - 1) * 100)}%（${ymLabel(prev)}→${ymLabel(last)}）`,
          detail: `${Math.round(prevRev).toLocaleString("ja-JP")}円 → ${Math.round(lastRev).toLocaleString("ja-JP")}円。入力漏れ・二重計上・実態の急変のいずれかを確認してください`,
          href: "/finance",
          weight: INTEGRITY_WEIGHT,
          scoreLabel: "数字の整合性",
        });
      }
    }
  }

  // 4. 5大KPIの目標値未設定
  const noTarget = CORE_KPI_CODES.filter((code) => {
    const k = kpis.find((x) => String(x.code) === code);
    return k && k.target_value == null;
  });
  if (noTarget.length > 0) {
    const names = noTarget
      .map((code) => String(kpis.find((x) => String(x.code) === code)?.name ?? code))
      .join("・");
    items.push({
      kind: "kpi",
      title: `KPI目標値の設定: ${names}（${noTarget.length}件）が未設定です`,
      detail: "目標が無いと全体スコアと未達検知が機能しません。Command Centerの「KPI手動更新」で設定してください",
      href: "/command",
      weight: NO_TARGET_WEIGHT * noTarget.length,
      scoreLabel: "5大KPI目標未設定",
    });
  }

  return items;
}
