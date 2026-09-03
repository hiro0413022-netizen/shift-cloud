import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 旧・レッスンカルテの入口（#155 → #210 で置き換え）
 *
 * かつてはここで lesson-os の共有URL（/s/<token>）を引いて外へ飛ばしていた。
 * **見るためにトークンを1本発行する**作りだったので、
 *   - コーチが【生徒へ共有リンク】を押していない会員には出ない（#207 の事故）
 *   - 押すたびに秘密のURLが増える
 * ユーザー指示「リンクを発行せずに即時に見えるようにしてください」を受けて、
 * 会員ページの中で直接描く `/member/lesson` に移した。
 *
 * ここは**古いブックマークとメールのリンクのために残す**だけ（転送）。
 */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/member/lesson", req.url));
}
