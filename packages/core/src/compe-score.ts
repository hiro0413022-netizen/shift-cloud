/**
 * コンペのスコア計算の正典（Compe OS / DECISIONS #232）。
 *
 * ★ 計算式はここ1か所だけに置く（DEVELOPMENT_RULES「数字の正典は1本だけ」）。
 *   画面ごとに書くと、スコアシート・スコアボード・案内文で順位が割れる。
 *   旧gensparkシステムは index.html と leaderboard.html にペリアの式が二重にあり、
 *   隠しホールの配列が食い違ったまま誰も気づかなかった。
 *
 * ★ 計算結果（GROSS/HCP/NET/順位）はDBに保存しない。
 *   保存すると、あとから隠しホールやパーを直したときに
 *   過去の表彰結果と現在の画面が食い違う。入力値だけを持ち、毎回ここで出す。
 */

export type CompeFormat =
  | "stroke"
  | "stableford"
  | "match"
  | "peria_single"
  | "peria_double"
  | "peria_double36";

export const COMPE_FORMAT_LABELS: Record<CompeFormat, string> = {
  stroke: "ストロークプレー",
  stableford: "スタブルフォード",
  match: "マッチプレー",
  peria_single: "シンペリア",
  peria_double: "ダブルペリア",
  peria_double36: "ダブルペリア（HCP上限36）",
};

export function formatLabel(format: string | null | undefined): string {
  if (!format) return "—";
  return COMPE_FORMAT_LABELS[format as CompeFormat] ?? format;
}

/** 隠しホール。OUT側とIN側を同数ずつ取る（一般的なコンペの慣例） */
export const PERIA_HOLES_SINGLE = [3, 5, 7, 1, 2, 4, 12, 14, 16, 10, 11, 13];
export const PERIA_HOLES_DOUBLE = [2, 4, 6, 8, 1, 3, 11, 13, 15, 17, 10, 12];

/** コースパー（旧システムと同じ 72 固定。コース別パーを持たせるならここを引数化する） */
export const DEFAULT_COURSE_PAR = 72;

export type HoleScores = Record<string, number | null | undefined>;

export type ScoreInput = {
  holes?: HoleScores | null;
  /** GROSS直接入力。あればホール合計より優先（当日は合計だけ聞いて回す運用が多い） */
  direct_gross?: number | null;
  note?: string | null;
};

export type PlayerInput = {
  id: string;
  name: string;
  /** 申告HCP。ペリア競技では使わない */
  hcp?: number | string | null;
  org?: string | null;
};

export function isPeria(format: string | null | undefined): boolean {
  return format === "peria_single" || format === "peria_double" || format === "peria_double36";
}

/** ホール別合計。入力のあるホールだけ足す（未入力は0扱いにしない） */
export function sumHoles(score: ScoreInput | null | undefined): number {
  if (!score?.holes) return 0;
  let total = 0;
  for (let h = 1; h <= 18; h += 1) {
    const raw = score.holes[`h${h}`];
    const v = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

/** GROSS。直接入力があればそれを使う */
export function calcGross(score: ScoreInput | null | undefined): number {
  const direct = score?.direct_gross;
  if (typeof direct === "number" && direct > 0) return direct;
  return sumHoles(score);
}

/**
 * ペリア方式のHCP。
 *   シンペリア  : (隠し6穴の合計 × 3   − パー) × 0.8
 *   ダブルペリア: (隠し12穴の合計 × 1.5 − パー) × 0.8
 * 0未満は0、peria_double36 は36で頭打ち。
 *
 * 隠しホールが1つも入力されていなければ 0（＝スコア未入力の人がNETで上位に来ない）。
 */
export function calcPeriaHcp(
  score: ScoreInput | null | undefined,
  format: CompeFormat | string,
  par: number = DEFAULT_COURSE_PAR
): number {
  const holes = format === "peria_single" ? PERIA_HOLES_SINGLE : PERIA_HOLES_DOUBLE;
  const src = score?.holes ?? {};
  let sum = 0;
  let count = 0;
  for (const h of holes) {
    const raw = src[`h${h}`];
    const v = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const multiplier = format === "peria_single" ? 3 : 1.5;
  const hcp = (sum * multiplier - par) * 0.8;
  const max = format === "peria_double36" ? 36 : 99;
  return Math.min(Math.max(hcp, 0), max);
}

/** 申告HCP（文字列でも数値でも受ける）。未申告は0 */
export function declaredHcp(player: PlayerInput): number {
  const raw = player.hcp;
  if (raw == null || raw === "") return 0;
  const v = typeof raw === "string" ? Number.parseFloat(raw) : raw;
  return Number.isFinite(v) ? v : 0;
}

export type ScoreRow = {
  player: PlayerInput;
  gross: number;
  hcp: number;
  /** スコア未入力なら null */
  net: number | null;
  note: string;
  /** 1位から。スコア未入力は null */
  rank: number | null;
  /** 同スコアの人がいる（マッチングカード等で人が決める必要がある） */
  tied: boolean;
};

/**
 * 全員分を計算して順位をつける。
 *
 * ★ 同点は同順位にして tied を立てる。
 *   旧システムは配列の並び順でそのまま1位・2位を出していたため、
 *   NETが同じでも「先に登録した人」が優勝になっていた（気づけない）。
 *   ゴルフ規則の同スコアはマッチングカードで人が決めるので、
 *   ここでは「並んでいる」ことを見せるところまでやる。
 */
export function buildScoreRows(
  players: PlayerInput[],
  scoreByPlayerId: Record<string, ScoreInput | undefined>,
  format: CompeFormat | string
): { ranked: ScoreRow[]; noScore: ScoreRow[] } {
  const peria = isPeria(format);
  const rows: ScoreRow[] = players.map((player) => {
    const score = scoreByPlayerId[player.id];
    const gross = calcGross(score);
    const hcp = peria ? calcPeriaHcp(score, format) : declaredHcp(player);
    return {
      player,
      gross,
      hcp,
      net: gross > 0 ? gross - hcp : null,
      note: score?.note ?? "",
      rank: null,
      tied: false,
    };
  });

  const ranked = rows
    .filter((r) => r.gross > 0)
    .sort((a, b) => (a.net ?? 0) - (b.net ?? 0) || a.gross - b.gross);

  // 同点は同順位（1,2,2,4 …）
  ranked.forEach((row, i) => {
    if (i > 0 && sameNet(ranked[i - 1], row)) {
      row.rank = ranked[i - 1].rank;
      row.tied = true;
      ranked[i - 1].tied = true;
    } else {
      row.rank = i + 1;
    }
  });

  return { ranked, noScore: rows.filter((r) => r.gross === 0) };
}

function sameNet(a: ScoreRow, b: ScoreRow): boolean {
  if (a.net == null || b.net == null) return false;
  // 0.05 未満の差は同じとみなす（ペリアHCPが小数のため）
  return Math.abs(a.net - b.net) < 0.05;
}

/** 表示用（NETは小数1位、整数なら小数を出さない） */
export function formatNet(net: number | null): string {
  if (net == null) return "—";
  return Number.isInteger(net) ? String(net) : net.toFixed(1);
}

export function formatHcp(hcp: number, peria: boolean, declared?: number | string | null): string {
  if (peria) return hcp > 0 ? hcp.toFixed(1) : "—";
  if (declared == null || declared === "") return "—";
  return String(declared);
}
