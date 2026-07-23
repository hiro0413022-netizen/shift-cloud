/**
 * SWING CORTEX 共通定義（docs/modules/swing-cortex/SYSTEM.md §4.2）
 * WING NOTEの生コメントを「スイング局面」「主症状」にルール分類し、
 * コーチのフリーテキスト/音声入力を最適な症状候補へ導く。
 * これはAI解析（フェーズ2 / Claude API）の前段の決定的ベースライン。
 * すべて依存なしの純関数（サーバー/クライアント両用）。
 */

export type DiagnosisResult = {
  symptomId: string;
  symptomName: string;
  category: string;
  tags: string[];
  flightDir: string | null;
  checkpoints: {
    priority: number;
    title: string;
    cause: string;
    fix: string;
    drill: string | null;
    client: string;
  }[];
};

/** スイング局面（コメントの実測分布に基づく） */
export const PHASES: { key: string; label: string; kw: string[] }[] = [
  { key: "takeback", label: "テイクバック/BS", kw: ["テイクバック", "バックスイング", "トップ", "上げ"] },
  { key: "rotation", label: "軸回転・捻転", kw: ["捻転", "軸回転", "回転", "ショルダー", "ターン"] },
  { key: "address", label: "アドレス/姿勢", kw: ["アドレス", "前傾", "スタンス", "猫背", "姿勢", "重心"] },
  { key: "sync", label: "同調・三角形", kw: ["同調", "三角形"] },
  { key: "lower", label: "下半身・踏込", kw: ["下半身", "踏み込", "股関節", "体重移動", "スウェー", "スエー"] },
  { key: "downswing", label: "ダウン・切返し", kw: ["ダウンスイング", "切り返", "切り替え"] },
  { key: "impact", label: "インパクト/打点", kw: ["インパクト", "打点", "フェース"] },
  { key: "grip", label: "グリップ/手元", kw: ["グリップ", "手元", "リスト", "右手", "左手"] },
  { key: "short", label: "アプローチ/パター", kw: ["アプローチ", "パター", "転が", "ウェッジ"] },
];

/** 主症状の推定キーワード（球筋・コースマネジメント中心） */
export const SYMPTOM_KEYS: { key: string; kw: string[] }[] = [
  { key: "スライス", kw: ["スライス", "アウトサイドイン", "カット"] },
  { key: "フック", kw: ["フック", "インサイドアウト", "被"] },
  { key: "プッシュ", kw: ["プッシュ"] },
  { key: "プル", kw: ["プル", "引っかけ", "引っ掛け"] },
  { key: "ダフリ", kw: ["ダフ", "ダウンブロー"] },
  { key: "トップ", kw: ["トップ", "こすり"] },
  { key: "捻転不足", kw: ["捻転不足", "捻転が浅", "回転不足"] },
  { key: "アドレス姿勢の不良", kw: ["猫背", "前傾", "アドレス"] },
  { key: "OB", kw: ["OB", "オービー", "曲がり"] },
];

/** ノイズ（挨拶のみ・極端に短い）判定 */
export function isNoise(body: string): boolean {
  const t = (body ?? "").trim();
  if (t.length < 8) return true;
  return ["こんにちは", "よろしくお願いします", "ありがとうございました"].includes(t);
}

/** コメント1件 → 局面配列 */
export function classifyPhases(body: string): string[] {
  const t = body ?? "";
  return PHASES.filter((p) => p.kw.some((k) => t.includes(k))).map((p) => p.label);
}

/** コメント1件 → 主症状キー（最初にヒットしたもの / なければ null） */
export function guessSymptom(body: string): string | null {
  const t = body ?? "";
  for (const s of SYMPTOM_KEYS) {
    if (s.kw.some((k) => t.includes(k))) return s.key;
  }
  return null;
}

/**
 * 口語・見たまま表現 → 症状名 の同義語辞書。
 * コーチが症状名を知らなくても「見たまま」で正解に届くための最小セット。
 * P2でこの写像はコメント資産＋Claude APIに置換・拡張する。
 */
export const SYNONYMS: { symptom: string; words: string[] }[] = [
  { symptom: "スライス", words: ["右に曲が", "右に出て曲", "右にすっぽ", "こすり球", "カット", "アウトサイドイン", "フェースが開", "つかまらない", "プッシュスライス"] },
  { symptom: "フック", words: ["左に曲が", "左に巻", "チーピン", "引っかけて曲", "被り", "インサイドアウト", "つかまりすぎ"] },
  { symptom: "アドレス姿勢の不良", words: ["猫背", "前傾", "姿勢", "構え", "重心が高", "アドレスが"] },
  { symptom: "捻転不足", words: ["回らない", "捻転", "軸回転", "浅い", "手打ち", "体が回", "腕で上げ", "テイクバックが"] },
  { symptom: "コースでのOBが多い", words: ["OB", "オービー", "曲げてはいけない", "コースで崩", "狙いすぎ", "大たたき"] },
];

/** クエリ→症状名候補（同義語辞書ベース。ヒットしたものを返す） */
export function synonymHits(query: string): string[] {
  const t = query ?? "";
  return SYNONYMS.filter((s) => s.words.some((w) => t.includes(w))).map((s) => s.symptom);
}

/**
 * フリーテキスト（短文・音声）→ 症状候補をスコア順に返す。
 * 症状名・タグ・球筋方向・同義語・カテゴリ・局面キーワードを加点。
 * 「右に曲がる」「頭が動く」など、症状名を知らない入力でも当てにいく。
 */
export function matchSymptoms(query: string, tree: DiagnosisResult[]): DiagnosisResult[] {
  const q = (query ?? "").trim();
  if (!q) return [];
  const hits = new Set(synonymHits(q));
  const phaseLabels = classifyPhases(q);

  const scored = tree.map((s) => {
    let score = 0;
    if (s.symptomName.includes(q) || q.includes(s.symptomName)) score += 6;
    if (hits.has(s.symptomName)) score += 5;
    for (const tag of s.tags) if (q.includes(tag)) score += 3;
    if (s.flightDir && q.includes(s.flightDir)) score += 3;
    if (q.includes(s.category)) score += 2;
    for (const ch of new Set(q.replace(/\s/g, "").split(""))) {
      if (ch.length && s.symptomName.includes(ch)) score += 0.2;
    }
    if (phaseLabels.length) {
      const titles = s.checkpoints.map((c) => c.title).join("");
      for (const p of phaseLabels) if (titles.includes(p.replace(/\/.*/, ""))) score += 1;
    }
    return { s, score };
  });

  return scored
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}

/** 取込集計の1行（phase×symptom） */
export type PatternCount = { phase: string; symptom_key: string; freq: number };

/** コメント配列 → (phase × symptom) の頻度集計。sc_patterns にupsertする材料。 */
export function aggregatePatterns(bodies: string[]): PatternCount[] {
  const map = new Map<string, number>();
  for (const body of bodies) {
    if (isNoise(body)) continue;
    const phases = classifyPhases(body);
    const sym = guessSymptom(body) ?? "その他";
    const usePhases = phases.length ? phases : ["その他"];
    for (const ph of usePhases) {
      const key = `${ph}|||${sym}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return [...map.entries()].map(([k, freq]) => {
    const [phase, symptom_key] = k.split("|||");
    return { phase, symptom_key, freq };
  });
}
