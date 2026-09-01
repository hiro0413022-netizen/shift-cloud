import { headers } from "next/headers";

/**
 * スマホで開いているかどうかを、サーバー側で先に判定する（#192・2026-09-01）
 *
 * 見た目の切り替えは基本 CSS（Tailwind の `md:`）で行う。画面を回したり
 * 幅を変えたりしても追随するし、判定を間違えても崩れないため。
 * ここの判定は「CSSだけでは決められないこと」に使う。
 *   例: 最初から開いておくか畳んでおくか / 一覧に何件出すか / 重い部品を出すか
 *
 * User-Agent は完全ではない（偽装もできるし新しい端末は取りこぼす）。
 * だから **これで動作を止めない**。あくまで初期値を寄せるだけに使うこと。
 */
export async function isMobileDevice(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  // iPadOS は Macintosh を名乗るので幅の広い端末として扱う（＝スマホ扱いしない）
  return /Android|iPhone|iPod|Windows Phone|Mobile Safari|Opera Mini/i.test(ua) && !/iPad|Tablet/i.test(ua);
}
