/**
 * 生徒向けページのブランド出し分け（#168）。
 *
 * きっかけ: FRANK GOLF の会員（小川さん）が共有URLを開いたら、
 * 右上に **GOLF WING** と出ていた。lsn_students は2店が同居している台帳なので、
 * ブランド名を画面に直書きすると必ずどちらかの店で嘘になる。
 *
 * 判定は store_id 1本。lesson-os の店舗スコープ（lib/auth.ts）と同じ考え方で、
 * **未設定は GOLF WING 扱い**（FRANK 由来のカルテには必ず store_id が入る一方、
 * GOLF WING の既存生徒と手で追加した生徒は未設定のままのため）。
 */
import { FRANK_STORE_ID } from "./auth";

export type Brand = {
  /** 画面に出す店名 */
  name: string;
  /** ヘッダーと見出しの色 */
  accent: string;
  /** バッジ・アイコン地の淡い色 */
  accentSoft: string;
  /** レーダーチャートの塗り */
  radarFill: string;
};

const GOLF_WING: Brand = {
  name: "GOLF WING",
  accent: "#1e5da8",
  accentSoft: "#e5ecf5",
  radarFill: "rgba(30,93,168,0.3)",
};

/** FRANK GOLF は深緑（公式サイト --green-2 と同じ値） */
const FRANK: Brand = {
  name: "FRANK GOLF",
  accent: "#1F6B41",
  accentSoft: "#e3efe8",
  radarFill: "rgba(31,107,65,0.3)",
};

export function brandOf(storeId: string | null | undefined): Brand {
  return storeId === FRANK_STORE_ID ? FRANK : GOLF_WING;
}
