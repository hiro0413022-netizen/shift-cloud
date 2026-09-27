/**
 * 機密レベル（議事録システムの一番大事な決めごと・2026-09-27）
 *
 * **機密レベルは録音の「前」に決め、あとから変えられない。**
 *   音声や文字起こしを外部のAIに送った時点で、機密はもう守れない。
 *   「弁護士の秘匿会議だった」と録音後に気づいても手遅れなので、
 *   どのAIで処理するか（＝どこにデータが行くか）は会議を作った瞬間に固定する。
 *
 * 要約モード（契約・開発・営業…）は録音後でも変えてよい（同じ文字起こしを別の型で要約し直すだけ）。
 *
 * ⚠ このファイルは純粋関数だけ（テスト tests/minutes-levels.test.ts）。
 *    L3 を外部AIに流す経路が1本でもできたら、このシステムの存在意義が消える。
 */

export type Level = "L1" | "L2" | "L3";
export const LEVELS: Level[] = ["L1", "L2", "L3"];

export type ProviderKind = "gemini" | "local";

export const LEVEL_INFO: Record<Level, { label: string; short: string; desc: string; where: string }> = {
  L1: {
    label: "L1 通常",
    short: "通常",
    desc: "社内定例・開発・営業など。クラウドAIで処理します。",
    where: "クラウドAI（Google Gemini）。音声は文字起こしが済んだら自動で削除。",
  },
  L2: {
    label: "L2 社外秘",
    short: "社外秘",
    desc: "契約・商談・人事など。見られるのは作成者とオーナーだけ。文字起こしは確定から30日で自動削除。",
    where: "学習に使われない有料APIのクラウドAIのみ。音声は即削除。",
  },
  L3: {
    label: "L3 秘匿",
    short: "秘匿",
    desc: "弁護士・法務・M&Aなど。外部のAIを一切使いません。",
    where: "YOZAN専用のLLMサーバーのみ（フェーズ3で開放）。",
  },
};

/** 確定した文字起こしを残す日数（L2のみ）。null は無期限（本人が消すまで） */
export const TRANSCRIPT_KEEP_DAYS: Record<Level, number | null> = { L1: null, L2: 30, L3: null };

export type Env = Record<string, string | undefined>;

export type LevelStatus = { available: boolean; reason: string | null };

/**
 * そのレベルで「いま新しい会議を作れるか」。
 *   L1: Gemini のキーがあること
 *   L2: さらに MINUTES_L2_ENABLED=1（＝そのキーが学習に使われない有料枠だと、人が確かめた印）
 *       キーの種類はプログラムからは判定できないので、人が確かめて立てる旗にした。
 *   L3: フェーズ1では作れない。文字起こしも要約も、クラウドのDB（Supabase）に置いてはいけない
 *       ので、保存先ごとYOZANサーバーに置けるようになるまで開けない（DBの check 制約でも止めている）。
 */
export function levelStatus(level: Level, env: Env): LevelStatus {
  const hasGemini = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
  if (level === "L1") {
    return hasGemini ? { available: true, reason: null } : { available: false, reason: "AIのキー（GEMINI_API_KEY）が未設定です" };
  }
  if (level === "L2") {
    if (!hasGemini) return { available: false, reason: "AIのキー（GEMINI_API_KEY）が未設定です" };
    if (env.MINUTES_L2_ENABLED !== "1") {
      return { available: false, reason: "学習に使われない有料APIであることの確認（MINUTES_L2_ENABLED=1）がまだです" };
    }
    return { available: true, reason: null };
  }
  return { available: false, reason: "フェーズ3（YOZAN専用LLMサーバー）で開放します" };
}

export class LevelRoutingError extends Error {}

/**
 * レベル → 処理するAI。**ここがAIの行き先を決める唯一の場所。**
 * L3 は local 以外を絶対に返さない。local が用意されていなければ投げる（Gemini に落とさない）。
 */
export function providerFor(level: Level, env: Env): ProviderKind {
  if (level === "L3") {
    if (!env.LOCAL_LLM_BASE_URL || !env.LOCAL_STT_BASE_URL) {
      throw new LevelRoutingError("L3（秘匿）はYOZAN専用サーバーでしか処理しません。サーバーが未設定のため処理を止めました");
    }
    return "local";
  }
  if (level === "L1" || level === "L2") {
    if (!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY)) throw new LevelRoutingError("AIのキーが未設定です");
    if (level === "L2" && env.MINUTES_L2_ENABLED !== "1") throw new LevelRoutingError("L2は有料APIの確認が済むまで使えません");
    return "gemini";
  }
  throw new LevelRoutingError(`不明な機密レベルです: ${String(level)}`);
}

export function isLevel(v: unknown): v is Level {
  return v === "L1" || v === "L2" || v === "L3";
}

/** 見てよい人。L1＝会社の議事録権限がある人全員／L2・L3＝作った人とオーナーだけ */
export function canView(
  level: Level,
  meeting: { createdBy: string | null },
  viewer: { staffId: string; isOwner: boolean }
): boolean {
  if (level === "L1") return true;
  return viewer.isOwner || meeting.createdBy === viewer.staffId;
}
