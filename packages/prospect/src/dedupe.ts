// 重複判定。
//
// 自動で拾い続ける仕組みでは、重複を許すと「同じ医院に2回営業メールを送る」という
// 取り返しのつかない事故になる。判定は必ずここを通し、純粋関数としてテストで固定する。

/** 屋号の正規化。全角/半角・空白・法人格・記号のゆれを潰す */
export function normalizeName(name: string): string {
  return (name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/(医療法人社団|医療法人財団|医療法人|社会医療法人|一般社団法人|公益社団法人|株式会社|有限会社|合同会社)/g, "")
    .replace(/[()（）［］\[\]「」【】,.、。・:：\-ー―‐~〜"'`]/g, "");
}

/** 電話番号の正規化。ハイフン・国番号・全角を落として数字だけにする */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  let d = phone.normalize("NFKC").replace(/[^\d+]/g, "");
  if (d.startsWith("+81")) d = "0" + d.slice(3);
  d = d.replace(/\D/g, "");
  return d.length >= 9 ? d : null;
}

/** サイトURLの正規化。www・末尾スラッシュ・スキーム・トラッキングパラメータを落とす */
export function normalizeSite(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    return host + path;
  } catch {
    return null;
  }
}

export interface DedupeKeys {
  name: string;
  phone: string | null;
  site: string | null;
}

export function dedupeKeys(p: { name: string; phone?: string | null; websiteUrl?: string | null }): DedupeKeys {
  return { name: normalizeName(p.name), phone: normalizePhone(p.phone), site: normalizeSite(p.websiteUrl) };
}

/**
 * 既存の営業先と同一かを判定する。
 * 電話一致・サイト一致は屋号が違っても同一とみなす（移転・改称で名前だけ変わることがある）。
 * 屋号だけの一致は「同じ市内」に限る（「たなか歯科」は全国にある）。
 */
export function isDuplicate(a: DedupeKeys & { city?: string | null }, b: DedupeKeys & { city?: string | null }): boolean {
  if (a.phone && b.phone && a.phone === b.phone) return true;
  if (a.site && b.site && a.site === b.site) return true;
  if (a.name && b.name && a.name === b.name) {
    if (!a.city || !b.city) return true; // 市が分からない側があるなら安全側（重複とみなす）に倒す
    return a.city === b.city;
  }
  return false;
}
