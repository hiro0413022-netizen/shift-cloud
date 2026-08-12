/**
 * シフトの「店舗ごとの出し分け」と「休み希望」の共通ロジック（純関数）。
 *
 * ここに集約している理由:
 *   GOLF WING（11:00-20:00）と FRANK GOLF は営業時間が違う。
 *   テンプレートを全画面で同じルールで絞らないと、片方の画面だけ
 *   他店舗の時間が出る、という事故が起きる（DECISIONS #131）。
 */

export type ScopedTemplate = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  is_day_off: boolean;
  color: string;
  scope_type?: string | null;   // 'company' = 全店共通 / 'store' = その店舗だけ
  scope_id?: string | null;
};

/** その店舗で使えるテンプレートだけに絞る（全店共通＋その店舗指定） */
export function templatesForStore<T extends ScopedTemplate>(templates: T[], storeId: string | null | undefined): T[] {
  return templates.filter((t) => {
    if (!t.scope_type || t.scope_type === "company") return true;
    if (t.scope_type === "store") return !!storeId && t.scope_id === storeId;
    return true; // brand等は未使用。増えたらここに足す
  });
}

/** 複数店舗に所属するスタッフ向け（自分の所属店舗のどれかに紐づくもの＋全店共通） */
export function templatesForStores<T extends ScopedTemplate>(templates: T[], storeIds: string[]): T[] {
  const set = new Set(storeIds);
  return templates.filter((t) => {
    if (!t.scope_type || t.scope_type === "company") return true;
    if (t.scope_type === "store") return !!t.scope_id && set.has(t.scope_id);
    return true;
  });
}

export type TimeOffRow = {
  staff_id: string;
  start_date: string;
  end_date: string;
  status: string;
  reason?: string | null;
};

export type TimeOffHit = { status: string; reason: string | null };

/**
 * 休み希望（期間）を「スタッフ|日付」の索引に展開する。
 * シフト作成画面のセルで、その日が休み希望かどうかを O(1) で引くため。
 * 承認済み(approved)が最優先。次に申請中(submitted)。
 */
export function timeOffIndex(rows: TimeOffRow[]): Map<string, TimeOffHit> {
  const out = new Map<string, TimeOffHit>();
  for (const r of rows) {
    if (r.status !== "approved" && r.status !== "submitted") continue;
    for (const d of eachDate(r.start_date, r.end_date)) {
      const key = `${r.staff_id}|${d}`;
      const cur = out.get(key);
      if (cur?.status === "approved") continue; // 承認済みを上書きしない
      out.set(key, { status: r.status, reason: r.reason ?? null });
    }
  }
  return out;
}

/** 両端を含む日付列（JSTのカレンダー日。時刻計算は挟まない） */
export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  if (end < start) return out;
  let cur = start;
  // 上限ガード: 誤入力で無限ループにしない（2年分まで）
  for (let i = 0; i < 800 && cur <= end; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** "2026-08-31" + 1 → "2026-09-01"（UTCで計算＝タイムゾーンの影響を受けない） */
export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 休み希望の入力チェック。問題なければ null */
export function validateTimeOff(start: string, end: string, today: string): string | null {
  if (!start || !end) return "開始日と終了日を入れてください";
  if (end < start) return "終了日が開始日より前になっています";
  if (end < today) return "過去の日付は申請できません";
  if (eachDate(start, end).length > 92) return "一度に申請できるのは92日までです";
  return null;
}
