/**
 * 期間限定キャンペーンの「いま出していいか・あと何日か」（#280・2026-09-26 ユーザー依頼）
 *
 * ユーザー依頼:「10月の月会費も無料キャンペーンみたいな感じで、キャンペーンをドーンとでかく打ちたい。
 *   体験者数を伸ばすため」
 *
 * ★ いちばん大事なのは「終わったら自動で消える」こと
 *   期限を人が消しに来る前提のバナーは、必ず消し忘れる。11月に「10月キャンペーン」が
 *   トップに出ていると、来た方は「この店の情報は古い」と受け取る。体験を増やすために
 *   出したものが、逆に信用を削る。so 掲載は until（JSTの暦日）で自動的に止める。
 *
 * ★ 残り日数は煽るためではなく、迷っている人の背中を押すため
 *   「あと3日」は事実。0日は「本日まで」と書く（「あと0日」は日本語として通じない）。
 *
 * ★ 判定はJSTの暦日だけで行う（時刻を持たない）
 *   until="2026-10-31" は「10月31日いっぱい」。時刻を混ぜると、端の日に
 *   お客様の端末の時計しだいで出たり消えたりする。
 */

export type CampaignCfg = {
  /** false なら期限内でも出さない（急に止めたいとき） */
  enabled?: boolean | null;
  /** 掲載する最終日（JST・"YYYY-MM-DD"）。この日いっぱいまで出す */
  until?: string | null;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 掲載していい日か。until が無い／読めない設定は「出さない」（事故のときに出しっぱなしにしない） */
export function campaignActive(todayYmd: string, cfg: CampaignCfg | null | undefined): boolean {
  if (!cfg || cfg.enabled === false) return false;
  const until = String(cfg.until ?? "").trim();
  if (!YMD.test(until) || !YMD.test(todayYmd)) return false;
  return todayYmd <= until;
}

/** 残り日数。0＝本日まで／負＝終了。暦日の差なので時刻は見ない */
export function campaignDaysLeft(todayYmd: string, until: string | null | undefined): number {
  const u = String(until ?? "").trim();
  if (!YMD.test(u) || !YMD.test(todayYmd)) return -1;
  // 日付だけの文字列は必ず Z で読む（+09:00 で読むと1日ずれる・#200 で踏んだ）
  const a = Date.parse(`${todayYmd}T00:00:00Z`);
  const b = Date.parse(`${u}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** 締切の言い方。「あと0日」を作らない */
export function deadlineLabel(daysLeft: number): string {
  if (daysLeft < 0) return "";
  if (daysLeft === 0) return "本日まで";
  if (daysLeft === 1) return "明日まで";
  return `あと${daysLeft}日`;
}

/** "2026-10-31" → "10月31日" */
export function ymdLabelJa(ymd: string | null | undefined): string {
  const s = String(ymd ?? "").trim();
  if (!YMD.test(s)) return "";
  return `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日`;
}
