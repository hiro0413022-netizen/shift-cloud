// Survey OS 共通型 + 集計ロジック（サーバー/クライアント両用の純粋関数）

export type QOption = { value: string; label: string };

export type QuestionType = "single" | "multi" | "text" | "textarea" | "ranking" | "scale";

export type QuestionConfig = {
  allow_other?: boolean;
  is_ranking_source?: boolean;
  source_code?: string;              // ranking: 母集団を絞る multi 設問の code
  pool?: QOption[];                  // ranking: 全候補
  min?: number;
  max?: number;
  min_label?: string;
  max_label?: string;
};

export type Question = {
  id: string;
  survey_id: string;
  section: string | null;
  position: number;
  code: string;
  type: QuestionType;
  title: string;
  help_text: string | null;
  required: boolean;
  options: QOption[];
  config: QuestionConfig;
};

export type Survey = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  purpose: string | null;
  status: "draft" | "open" | "closed";
  is_anonymous: boolean;
  intro_text: string | null;
  thanks_text: string | null;
  est_minutes: number | null;
  response_count: number;
};

// 回答値（jsonb）
export type AnswerValue = {
  value?: string;        // single / scale(number as string)
  values?: string[];     // multi
  other?: string;        // multi allow_other
  text?: string;         // text / textarea
  order?: string[];      // ranking（上位から）
};

export type AnswerRow = { question_code: string; value: AnswerValue };

/** options / config の緩いパース（DBのjsonbはunknownで来る） */
export function asOptions(v: unknown): QOption[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((o): o is QOption => o != null && typeof o === "object" && "value" in o)
    .map((o) => ({ value: String((o as QOption).value), label: String((o as QOption).label ?? (o as QOption).value) }));
}
export function asConfig(v: unknown): QuestionConfig {
  return v && typeof v === "object" ? (v as QuestionConfig) : {};
}

export function labelOf(options: QOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

// ============================================================
// 順位付け集計（ボルダ得点 + 平均順位）
// ============================================================
export type CoachStat = {
  value: string;
  label: string;
  appearances: number;   // 評価された回数（受講経験ありで並び替え対象になった数）
  firsts: number;        // 1位になった回数
  firstRate: number;     // 1位率(%)
  avgRank: number | null;// 平均順位（小さいほど良い）
  bordaAvg: number;      // 正規化ボルダ平均(0..100, 大きいほど良い) = 平均((n-i)/n)*100
};

/**
 * 1つの順位付け設問について、コーチ別のスコアを算出。
 * orders: 各回答の順位配列（上位から）。各回答は評価対象コーチのみを含む（長さが異なりうる）。
 * 正規化ボルダ: 長さnの回答で位置i(0始まり)は (n - i) / n 点 → 1位=1.0, 最下位=1/n。
 * 回答ごとに評価コーチ数が違っても公平に比較できる。
 */
export function rankingStats(orders: string[][], pool: QOption[]): CoachStat[] {
  const acc = new Map<string, { appear: number; firsts: number; rankSum: number; bordaSum: number }>();
  for (const o of pool) acc.set(o.value, { appear: 0, firsts: 0, rankSum: 0, bordaSum: 0 });

  for (const order of orders) {
    const n = order.length;
    if (n === 0) continue;
    order.forEach((val, i) => {
      const a = acc.get(val) ?? { appear: 0, firsts: 0, rankSum: 0, bordaSum: 0 };
      a.appear += 1;
      a.rankSum += i + 1;
      if (i === 0) a.firsts += 1;
      a.bordaSum += (n - i) / n;
      acc.set(val, a);
    });
  }

  return pool.map((o) => {
    const a = acc.get(o.value)!;
    return {
      value: o.value,
      label: o.label,
      appearances: a.appear,
      firsts: a.firsts,
      firstRate: a.appear > 0 ? Math.round((a.firsts / a.appear) * 1000) / 10 : 0,
      avgRank: a.appear > 0 ? Math.round((a.rankSum / a.appear) * 100) / 100 : null,
      bordaAvg: a.appear > 0 ? Math.round((a.bordaSum / a.appear) * 1000) / 10 : 0,
    };
  });
}

/** 選択肢集計（single / multi / scale） */
export function countChoices(values: string[], options: QOption[]): { option: QOption; count: number; pct: number }[] {
  const total = values.length;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return options.map((o) => {
    const count = counts.get(o.value) ?? 0;
    return { option: o, count, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 };
  });
}

/** CSVセル: 値を人間可読な文字列へ（ラベル解決） */
export function answerToCell(q: Question, v: AnswerValue | undefined): string {
  if (!v) return "";
  switch (q.type) {
    case "single":
    case "scale":
      return v.value ? labelOf(q.options, v.value) : "";
    case "multi": {
      const labels = (v.values ?? []).map((x) => labelOf(q.options, x));
      if (v.other) labels.push(`その他:${v.other}`);
      return labels.join(" / ");
    }
    case "text":
    case "textarea":
      return v.text ?? "";
    case "ranking": {
      const pool = q.config.pool ?? q.options;
      return (v.order ?? []).map((x, i) => `${i + 1}.${labelOf(pool, x)}`).join(" > ");
    }
    default:
      return "";
  }
}

export function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
