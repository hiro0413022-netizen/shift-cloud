/* ============================================================
   ホームの純粋な部分（#244）。DBを触らない＝ node --test で固定する。
   ============================================================ */

/**
 * ④ 目標までの残りを「1日あたり」に直す。
 * 「あと58万円」より「1日あたり3.9万円」のほうが、今日何をすればいいかに繋がる。
 * 低いほど良い指標（退会率・人件費率）は「目安以内／超過」で返す。
 */
export function remainingPerDay(input: {
  code: string;
  value: number | null;
  target: number | null;
  unit: string;
  /** JST の今日 "YYYY-MM-DD" */
  today: string;
}): string | null {
  const { code, value, target, unit, today } = input;
  if (value == null || target == null || !Number.isFinite(value) || !Number.isFinite(target) || target === 0) return null;
  const lowerIsBetter = code === "churn_rate" || code === "labor_cost_ratio" || code === "labor_cost";
  if (lowerIsBetter) {
    return value <= target ? `目安 ${fmt(target, unit)} 以内` : `目安 ${fmt(target, unit)} を超えています`;
  }
  const remain = target - value;
  if (remain <= 0) return `目標 ${fmt(target, unit)} 達成`;
  const daysLeft = daysLeftInMonth(today);
  if (unit === "%" || daysLeft <= 0) return `目標 ${fmt(target, unit)}（あと ${fmt(remain, unit)}）`;
  const perDay = remain / daysLeft;
  return `あと ${fmt(remain, unit)} ＝ 1日 約${fmt(perDay, unit)}`;
}

/** 今日を含めた月内の残り日数 */
export function daysLeftInMonth(today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.max(0, last - d + 1);
}

/** 単位つきの丸め。円は万円に、%は小数1桁に */
export function fmt(v: number, unit: string): string {
  if (unit === "円") {
    if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, "")}万円`;
    return `${Math.round(v).toLocaleString("ja-JP")}円`;
  }
  if (unit === "%") return `${Math.round(v * 10) / 10}%`;
  return `${Math.round(v * 10) / 10}${unit}`;
}

/** KPI コード → ドリルダウンの指標 */
export function drillMetricOfKpi(code: string): string | null {
  const m: Record<string, string> = {
    monthly_sales: "monthly_sales",
    members: "members",
    conversion_rate: "conversion_rate",
    churn_rate: "churn_rate",
    trial_bookings: "trial_bookings",
    labor_cost: "labor_cost",
    labor_cost_ratio: "labor_cost",
  };
  return m[code] ?? null;
}

/* ------------------------------------------------------------
   ② 前回見た時からの変化を1行にする
------------------------------------------------------------ */
export type ChangeCounts = { joins: number; trials: number; leaves: number; inquiries: number; warnings: number };

export function changesLine(c: ChangeCounts): { label: string; value: number; tone: "ok" | "warn" | "dim" }[] {
  const out: { label: string; value: number; tone: "ok" | "warn" | "dim" }[] = [];
  if (c.joins) out.push({ label: "入会", value: c.joins, tone: "ok" });
  if (c.trials) out.push({ label: "体験申込", value: c.trials, tone: "ok" });
  if (c.leaves) out.push({ label: "退会の申出", value: c.leaves, tone: "warn" });
  if (c.inquiries) out.push({ label: "問い合わせ", value: c.inquiries, tone: "dim" });
  if (c.warnings) out.push({ label: "警告", value: c.warnings, tone: "warn" });
  return out;
}

/** 前回の時刻の表示（同じ日なら時刻だけ） */
export function sinceLabel(sinceIso: string, now: Date = new Date()): string {
  const d = new Date(sinceIso);
  if (Number.isNaN(d.getTime())) return "前回";
  const tz = "Asia/Tokyo";
  const sameDay = d.toLocaleDateString("ja-JP", { timeZone: tz }) === now.toLocaleDateString("ja-JP", { timeZone: tz });
  const time = d.toLocaleTimeString("ja-JP", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `今日 ${time}`;
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (d.toLocaleDateString("ja-JP", { timeZone: tz }) === yesterday.toLocaleDateString("ja-JP", { timeZone: tz })) return `昨日 ${time}`;
  return `${d.toLocaleDateString("ja-JP", { timeZone: tz, month: "numeric", day: "numeric" })} ${time}`;
}

/* ------------------------------------------------------------
   ③ 右パネルのキー（URL の ?panel= に載せる）
------------------------------------------------------------ */
export type PanelKey = { source: string; id: string };

export function panelKey(source: string, id: string): string {
  return `${source}:${id}`;
}

export function parsePanelKey(v: unknown): PanelKey | null {
  if (typeof v !== "string") return null;
  const i = v.indexOf(":");
  if (i <= 0) return null;
  return { source: v.slice(0, i), id: v.slice(i + 1) };
}
