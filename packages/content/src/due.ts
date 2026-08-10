import type { CntPost } from "./types";

/** 連投が進まないまま何tick我慢するか（server.ts と共有） */
export const THREAD_STALL_LIMIT = 6;

/**
 * この行にまだ配信する仕事が残っているか（publishDue の枠を使う価値があるか）。
 *
 * ⚠ 2026-08-10のX投稿停止の再発防止。
 *   Xは承認なしで投稿できる（gn_loops.config.x_auto）が、Instagramは承認が要る。
 *   承認されない行は status=awaiting_approval のまま永久に残るため、
 *   publishDue が古い順にN件だけ拾うと「Xは投稿済み・IGは承認待ち」の残骸が枠を占領し、
 *   新しい投稿に順番が回らなくなる。取得後にこの関数で絞ってから件数を切ること。
 *
 * 承認済み（scheduled）は必ず true ＝publishDueが posted/failed に確定させるので溜まらない。
 * 承認待ちはXしか出せないので、Xが済んでいれば「もう用事なし」。
 */
export function hasPendingWork(post: CntPost, xAuto: boolean): boolean {
  if (post.status === "scheduled") return true;
  if (!xAuto) return false;
  const isThread = post.threadParts.length > 0;
  if (isThread) {
    // 止まったままの連投（stall上限に達した）も枠を返す＝後続の投稿を止めない
    if (Number(post.source.thread_stalls ?? 0) >= THREAD_STALL_LIMIT) return false;
    return post.threadTweetIds.length < post.threadParts.length;
  }
  return !post.xTweetId;
}
