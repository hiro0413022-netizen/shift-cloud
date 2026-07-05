import "server-only";
import crypto from "crypto";

/** タブレット受付トークンのハッシュ化（DECISIONS #12: 生トークンは発行時のみ表示、DBはsha256のみ保持） */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** URLセーフなランダムトークンを生成 */
export function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export const INTAKE_TOKEN_TTL_HOURS = 12;
