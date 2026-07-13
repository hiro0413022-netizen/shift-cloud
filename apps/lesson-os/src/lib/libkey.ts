/**
 * 資料室のStorageキー変換（2026-07-13）
 * Supabase Storageのオブジェクトキーは日本語等が使えない（"Invalid key"）ため、
 * 分類・ファイル名の各セグメントを base64url で持ち、表示時に復号する。
 * キー形式: {companyId}/{enc(分類)}/{timestamp}_{enc(ファイル名)}
 */
export function encSeg(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

export function decSeg(s: string): string {
  try {
    const d = Buffer.from(s, "base64url").toString("utf8");
    // 復号結果が化けている場合はそのまま返す（旧データ・ASCII名との互換）
    return d && !d.includes("�") ? d : s;
  } catch {
    return s;
  }
}
