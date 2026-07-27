/**
 * SWING CORTEX 共通定義（docs/modules/swing-cortex/SYSTEM.md §4.2）
 * WING NOTEの生コメントを「スイング局面」「主症状」にルール分類し、
 * コーチのフリーテキスト/音声入力を最適な症状候補へ導く。
 * これはAI解析（フェーズ2 / Claude API）の前段の決定的ベースライン。
 * すべて依存なしの純関数（サーバー/クライアント両用）。
 */

// 相対＋拡張子つき: Next（webpack/turbopack）と node --test の両方から同じ形で解決できる
import { similarity, bestSimilarity } from "./jp-search.ts";

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
 * 口語・見たまま表現 → 症状キーワード の同義語辞書。
 * コーチが症状名を知らなくても「見たまま」で正解に届くためのもの。
 * `symptom` は症状名/タグに“含まれていれば当たり”とみなすキーワード（あいまい一致）。
 * words 側も正規化＋あいまい一致で照合するので、活用・送り仮名・かな/漢字の違いは自動で吸収される。
 */
export const SYNONYMS: { symptom: string; words: string[] }[] = [
  { symptom: "スライス", words: ["右に曲がる", "右に出て曲がる", "右にすっぽ抜ける", "こすり球", "こする", "カット", "アウトサイドイン", "フェースが開く", "つかまらない", "プッシュスライス", "右にしか行かない"] },
  { symptom: "フック", words: ["左に曲がる", "左に巻く", "チーピン", "引っかける", "引っかかる", "被る", "インサイドアウト", "つかまりすぎ", "左に飛ぶ"] },
  { symptom: "プッシュ", words: ["右へまっすぐ", "押し出し", "右に出る"] },
  { symptom: "ダフリ", words: ["手前を叩く", "ザックリ", "地面を叩く", "ダフる", "土が飛ぶ"] },
  { symptom: "トップ", words: ["上を叩く", "薄い当たり", "こすり", "球が上がらない", "チョロ"] },
  { symptom: "シャンク", words: ["ネックに当たる", "右前に飛ぶ", "クラブが寝る", "シャフトが寝る", "寝る"] },
  { symptom: "アドレス", words: ["猫背", "前傾", "姿勢", "構え", "重心が高い", "アドレスが崩れる", "スタンス", "ボール位置", "向きがずれる"] },
  { symptom: "捻転", words: ["回らない", "捻転が浅い", "軸回転", "肩が回らない", "腕で上げる", "テイクバックが浅い", "体が回らない"] },
  { symptom: "手打ち", words: ["手先で打つ", "小手先", "こねる", "リストを返す", "腕だけで振る"] },
  { symptom: "伸び上がり", words: ["起き上がる", "伸びあがる", "立ち上がる", "体が浮く", "手元が浮く", "前傾がほどける", "背筋が伸びる"] },
  { symptom: "突っ込み", words: ["頭が動く", "頭が突っ込む", "前に出る", "ビハインドザボールができない"] },
  { symptom: "スウェー", words: ["右にずれる", "流れる", "スエー", "体が横に動く", "軸がぶれる"] },
  { symptom: "体重移動", words: ["乗らない", "右足体重", "踏み込めない", "体重が残る"] },
  { symptom: "下半身", words: ["下半身が使えない", "上半身に頼る", "地面反力", "足を使えない"] },
  { symptom: "同調", words: ["バラバラ", "三角形が崩れる", "一体感がない", "腕と体が合わない"] },
  { symptom: "早解け", words: ["アーリーリリース", "タメがない", "キャスティング", "力が逃げる", "ほどけるのが早い"] },
  { symptom: "オーバースイング", words: ["トップが大きい", "クロスする", "上げすぎ", "緩む"] },
  { symptom: "切り返し", words: ["上から下りる", "上体が先に動く", "被る", "打ち急ぐ"] },
  { symptom: "フォロー", words: ["振り抜けない", "止まる", "当てにいく", "フィニッシュが崩れる"] },
  { symptom: "リズム", words: ["振りが速い", "間がない", "タイミングが合わない", "テンポ", "打ち急ぐ"] },
  { symptom: "飛距離", words: ["飛ばない", "パワーが伝わらない", "飛ばしたい", "距離が出ない"] },
  { symptom: "方向性", words: ["散らばる", "曲がりが読めない", "まっすぐ飛ばない", "安定しない"] },
  { symptom: "ミート", words: ["芯を外す", "当たりが薄い", "当たらない", "空振り"] },
  { symptom: "グリップ", words: ["握り", "ウィーク", "ストロング", "右手が強い", "握りが強い"] },
  { symptom: "OB", words: ["オービー", "曲げてはいけない", "コースで崩れる", "狙いすぎ", "大たたき"] },
  { symptom: "バンカー", words: ["砂", "エクスプロージョン", "出ない", "苦手"] },
  { symptom: "アプローチ", words: ["寄らない", "距離感", "寄せ", "ザックリ"] },
  { symptom: "パター", words: ["3パット", "ストローク", "入らない", "距離感が合わない"] },
  { symptom: "力み", words: ["力む", "緊張", "リラックスできない", "1番ホール", "硬くなる"] },
];

/** クエリ→症状キーワード候補（同義語辞書ベース。あいまい一致でヒットしたものを返す） */
export function synonymHits(query: string): string[] {
  const q = query ?? "";
  return SYNONYMS.filter((s) => s.words.some((w) => similarity(q, w) >= 0.6)).map((s) => s.symptom);
}

/** スコア付き検索結果（デバッグ・UI表示用に score も返す） */
export type ScoredSymptom = { symptom: DiagnosisResult; score: number };

/**
 * フリーテキスト（短文・音声）→ 症状候補をスコア順に返す。
 *
 * すべての照合を `lib/jp-search` の正規化＋2-gram あいまい一致で行うため、
 * 「伸びあがり / 伸びあがる / 伸び上がる / のびあがり / 起き上がる」のような
 * 活用・送り仮名・漢字かなの違いを吸収して同じ症状に着地する。
 */
export function matchSymptomsScored(query: string, tree: DiagnosisResult[]): ScoredSymptom[] {
  const q = (query ?? "").trim();
  if (!q) return [];
  const hits = synonymHits(q);
  const phaseLabels = classifyPhases(q);

  const scored = tree.map((symptom) => {
    let score = 0;

    // 症状名（最重要）
    score += 6 * similarity(q, symptom.symptomName);

    // タグ（最大1件＋追加ヒットは少しだけ加点。タグ数の多い症状が有利になりすぎないように）
    const tagSims = symptom.tags.map((t) => similarity(q, t)).filter((v) => v > 0).sort((a, b) => b - a);
    if (tagSims.length) score += 3.5 * tagSims[0] + 0.6 * (tagSims.length - 1);

    // 球筋方向・カテゴリ
    if (symptom.flightDir) score += 3 * similarity(q, symptom.flightDir);
    score += 1.5 * similarity(q, symptom.category);

    // 同義語辞書（見たまま表現 → 症状キーワード）
    for (const key of hits) {
      if (similarity(symptom.symptomName, key) >= 0.6 || symptom.tags.some((t) => similarity(t, key) >= 0.6)) {
        score += 5;
        break;
      }
    }

    // 確認項目・原因・対処・ドリルの本文（弱い加点＝取りこぼし防止）
    let bodyBest = 0;
    for (const cp of symptom.checkpoints) {
      bodyBest = Math.max(bodyBest, bestSimilarity(q, [cp.title, cp.cause, cp.fix, cp.drill]));
      if (bodyBest >= 1) break;
    }
    score += 1.6 * bodyBest;

    // 局面キーワード
    if (phaseLabels.length) {
      const titles = symptom.checkpoints.map((c) => c.title).join("");
      for (const p of phaseLabels) if (titles.includes(p.replace(/\/.*/, ""))) score += 1;
    }

    return { symptom, score };
  });

  const ranked = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const strong = ranked.filter((x) => x.score >= 1.2);
  // 強い候補が無いときは、弱い候補でも上位3件は見せる（「見つかりません」で止めない）
  return (strong.length ? strong : ranked.slice(0, 3)).slice(0, 15);
}

/** 検索結果（症状のみ）。既存の呼び出し互換。 */
export function matchSymptoms(query: string, tree: DiagnosisResult[]): DiagnosisResult[] {
  return matchSymptomsScored(query, tree).map((x) => x.symptom);
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
