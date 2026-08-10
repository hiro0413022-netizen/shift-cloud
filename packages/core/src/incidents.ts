// イレギュラー報告（sp_incidents）の分類定義。
//
// なぜ packages/core に置くか:
//   スタッフが書く側（shift-cloud /report）と、分析して見る側（genesis /incidents）で
//   同じラベルを使う。2箇所に定数をコピーすると必ず片方だけ増えてズレるため、最初から共有にする。
//
// なぜ DB の CHECK 制約にしないか:
//   カテゴリは運用しながら増える。CHECK にすると増やすたびに migration が要り、
//   さらに「一覧に無い値の行が画面から静かに消える」事故（Vault 2026-08-07）を招く。
//   DB は text で受け、表示側は normalizeIncidentCategory() で必ずどれかに寄せる。

/** カテゴリ（表示順＝この定義順） */
export const INCIDENT_CATEGORIES: Record<string, string> = {
  customer: "お客様クレーム",
  equipment: "設備・機器トラブル",
  booking: "予約・受付ミス",
  payment: "会計・決済ミス",
  product: "商品・在庫・発注",
  injury: "ケガ・事故・安全",
  facility: "施設・清掃・破損",
  staff: "スタッフ・シフト",
  other: "その他",
};

/** カテゴリの補足（フォームで「どれを選べばいいか」の迷いを減らす） */
export const INCIDENT_CATEGORY_HINTS: Record<string, string> = {
  customer: "お叱り・ご不満・要望",
  equipment: "シミュレーター・PC・空調など",
  booking: "ダブルブッキング・伝達もれ",
  payment: "レジ違算・返金・請求ミス",
  product: "発注ミス・破損・欠品",
  injury: "ケガ・ヒヤリハット",
  facility: "水漏れ・汚損・鍵など",
  staff: "遅刻・欠勤・引継ぎもれ",
  other: "上のどれにも当てはまらない",
};

/** 表記ゆれ・旧値の吸収（未知値は other に寄せる＝行を消さない） */
const CATEGORY_ALIASES: Record<string, string> = {
  クレーム: "customer",
  お客様: "customer",
  接客: "customer",
  claim: "customer",
  設備: "equipment",
  機器: "equipment",
  machine: "equipment",
  予約: "booking",
  受付: "booking",
  reservation: "booking",
  会計: "payment",
  レジ: "payment",
  決済: "payment",
  商品: "product",
  在庫: "product",
  発注: "product",
  inventory: "product",
  ケガ: "injury",
  事故: "injury",
  安全: "injury",
  safety: "injury",
  施設: "facility",
  清掃: "facility",
  破損: "facility",
  スタッフ: "staff",
  シフト: "staff",
  その他: "other",
};

/** 表示に使う正規キーへ変換。未知のカテゴリは other（＝一覧から消さない） */
export function normalizeIncidentCategory(raw: string | null | undefined): string {
  const c = (raw ?? "").trim();
  if (!c) return "other";
  if (c in INCIDENT_CATEGORIES) return c;
  const lower = c.toLowerCase();
  if (lower in INCIDENT_CATEGORIES) return lower;
  return CATEGORY_ALIASES[c] ?? CATEGORY_ALIASES[lower] ?? "other";
}

/** カテゴリラベル（未知値もそのまま出さずに other へ寄せる） */
export function incidentCategoryLabel(raw: string | null | undefined): string {
  const key = normalizeIncidentCategory(raw);
  return INCIDENT_CATEGORIES[key] ?? INCIDENT_CATEGORIES.other;
}

/** 重大度。high は即LINE通知の対象 */
export const INCIDENT_SEVERITIES = ["low", "mid", "high"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  low: "軽微",
  mid: "ふつう",
  high: "重大",
};

export const INCIDENT_SEVERITY_HINT: Record<IncidentSeverity, string> = {
  low: "共有しておきたい程度",
  mid: "対応が要る",
  high: "すぐ知らせたい（責任者へLINE通知）",
};

export function normalizeSeverity(raw: string | null | undefined): IncidentSeverity {
  const s = (raw ?? "").trim().toLowerCase();
  return (INCIDENT_SEVERITIES as readonly string[]).includes(s) ? (s as IncidentSeverity) : "mid";
}

/** 対応状況 */
export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  resolved: "対応済み",
};

/** 再発防止策（sp_incident_insights）の進捗 */
export const INSIGHT_STATUS_LABEL: Record<string, string> = {
  open: "未着手",
  doing: "対応中",
  done: "完了",
  dismissed: "見送り",
};

export type IncidentRow = {
  id: string;
  category: string;
  severity: string;
  occurred_at: string;
  place: string | null;
  involved: string | null;
  body: string;
  action_taken: string | null;
  status: string;
  store_id: string | null;
};

/** カテゴリ別の件数（多い順）。全件がどこかに入ることを保証する */
export function countByCategory(rows: Pick<IncidentRow, "category">[]): { cat: string; label: string; count: number }[] {
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const cat = normalizeIncidentCategory(r.category);
    buckets.set(cat, (buckets.get(cat) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .map(([cat, count]) => ({ cat, label: INCIDENT_CATEGORIES[cat] ?? INCIDENT_CATEGORIES.other, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 「同じことが繰り返されている」候補を機械的に拾う（AIが落ちても必ず出る土台）。
 * 同一カテゴリが threshold 件以上あるものを返す。
 */
export function repeatedCategories(
  rows: Pick<IncidentRow, "category" | "occurred_at">[],
  threshold = 2
): { cat: string; label: string; count: number }[] {
  return countByCategory(rows).filter((c) => c.count >= threshold);
}

export type InsightDraft = {
  title: string;
  pattern: string;
  cause: string | null;
  prevention: string;
  categories: string[];
  incident_ids: string[];
  store_id: string | null;
};

/**
 * ルールベースの分析（AIキーが無い・APIが落ちている時でも必ず結果が出る土台）。
 * 「分析されませんでした」で画面が空になるのが一番困るため、純粋関数として独立させ、
 * DBにもAIにも依存しない形にしてテストで固定する。
 */
export function ruleBasedInsights(rows: IncidentRow[]): InsightDraft[] {
  return countByCategory(rows)
    .filter((c) => c.count >= 2)
    .map((c) => {
      const hits = rows.filter((r) => normalizeIncidentCategory(r.category) === c.cat);
      const places = [...new Set(hits.map((h) => h.place).filter(Boolean))] as string[];
      const stores = [...new Set(hits.map((h) => h.store_id).filter(Boolean))] as string[];
      const highs = hits.filter((h) => normalizeSeverity(h.severity) === "high").length;
      return {
        title: `${c.label}が${c.count}件`,
        pattern: [
          `直近で「${c.label}」の報告が${c.count}件ありました。`,
          places.length ? `場所は ${places.slice(0, 4).join("・")} に集中しています。` : "",
          highs ? `うち重大が${highs}件です。` : "",
        ]
          .filter(Boolean)
          .join(""),
        cause: null,
        prevention: `${c.label}の報告${c.count}件を並べて読み、共通する手順・タイミングを特定してください。同じ場面で必ず1つ確認を挟む形にすると再発が止まります。`,
        categories: [c.cat],
        incident_ids: hits.map((h) => h.id).slice(0, 20),
        store_id: stores.length === 1 ? stores[0] : null,
      };
    });
}
