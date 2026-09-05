import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * アプリ間のサーバー呼び出しに署名する（#222）
 *
 * member-os から Genesis の管理用APIを呼ぶときに使う。
 * Genesis 側にしか無いもの（PDFのフォント、Squareのキー）を使う処理は Genesis に置くしかないが、
 * **URLを知っているだけで誰でも叩ける状態にはしない**。
 *
 * ★ 鍵は新しく増やさない。両アプリが同じ Supabase の service_role キーを持っているので、
 *   それを HMAC の鍵に使う（アプリ間で必ず一致し、外には出ない）。
 * ★ 有効期限つき（既定5分）。リンクを転送されても、あとから叩けない。
 */
const SECRET = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function signAdminPayload(payload: string, expEpochMs: number): string {
  return createHmac("sha256", SECRET()).update(`${expEpochMs}.${payload}`).digest("hex");
}

/** 署名と有効期限の両方を確かめる。どちらか欠けても false（迷ったら通さない）。 */
export function verifyAdminPayload(payload: string, expEpochMs: number, sig: string, nowMs = Date.now()): boolean {
  if (!SECRET() || !sig) return false;
  if (!Number.isFinite(expEpochMs) || expEpochMs < nowMs) return false;
  const expected = signAdminPayload(payload, expEpochMs);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 署名の既定の有効期間（ミリ秒）。押してから開くまでの余裕として5分。 */
export const ADMIN_SIG_TTL_MS = 5 * 60 * 1000;
