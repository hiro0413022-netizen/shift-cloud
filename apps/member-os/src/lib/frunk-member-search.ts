/**
 * FRANK会員の「探す・絞る・数える」（#139・2026-08-18）
 *
 * ★ なぜ純関数で切り出すか
 *   会員一覧は /frunk（会員管理）と /search（来店検索）と予約作成の会員指定で必要になり、
 *   検索の当たり方が画面ごとにズレると「この人いないんですけど」が起きる。
 *   money-os の table-filter.ts と同じ考え方で、当たり判定をここ1か所に集約してテストする。
 *
 * ★ 表記ゆれの吸収（NFKC）
 *   全角英数・半角カナ・ハイフンの種類ちがいで当たらないのが現場でいちばん多い事故。
 *   検索語と対象の両方を NFKC で正規化し、空白・記号を落としてから比べる。
 *   カナはひらがな⇔カタカナも寄せる（「たなか」で「タナカ」に当たる）。
 *
 * ★ 電話番号は数字だけで比べる（下10桁）
 *   090-1234-5678 / 09012345678 / +81 90 1234 5678 が同じものとして当たるようにする。
 */

export type FrunkMemberLike = {
  id: string;
  member_no?: string | null;
  name?: string | null;
  name_kana?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
  plan_id?: string | null;
  join_date?: string | null;
  leave_date?: string | null;
  alert_note?: string | null;
  note?: string | null;
  /** 法人の会社名（#206）。法人の方は「会社名でも」引けるようにする */
  company_name?: string | null;
};

/** 全角→半角・記号落とし・小文字化。ひらがなはカタカナへ寄せる */
export function normalizeKey(s: unknown): string {
  const base = String(s ?? "").normalize("NFKC").toLowerCase();
  const kana = base.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  return kana.replace(/[\s　\-‐‑‒–—―ー_.,･・／/()（）]/g, "");
}

/** 数字だけ（部分一致用） */
export function digitsOnly(s: unknown): string {
  return String(s ?? "").replace(/[^0-9]/g, "");
}

/** 数字だけ。長いものは下10桁（国番号・市外局番の書き方ちがいを吸収） */
export function phoneKey(s: unknown): string {
  const d = digitsOnly(s);
  return d.length > 10 ? d.slice(-10) : d;
}

/** 会員1件が検索語に当たるか。空の検索語は全件ヒット */
export function matchesMember(m: FrunkMemberLike, query: string): boolean {
  const q = normalizeKey(query);
  if (q === "") return true;

  // 会社名も入れる（#206）。法人は「株式会社ヨザンの誰か」で探されることが多い
  const fields = [m.name, m.name_kana, m.member_no, m.email, m.note, m.alert_note, m.company_name];
  if (fields.some((f) => normalizeKey(f).includes(q))) return true;

  // 電話は数字だけで比較（検索語が数字を含むときのみ）。
  // 「090-1234」のような途中までの入力でも当たるよう、桁を削らない数字列でも比べる
  // （下10桁キーだけだと先頭の0が落ちて "0901234" が当たらない）。
  const qd = digitsOnly(query);
  if (qd.length >= 3 && (digitsOnly(m.phone).includes(qd) || phoneKey(m.phone).includes(phoneKey(query)))) return true;

  return false;
}

export type MemberFilter = {
  /** フリーワード（氏名・カナ・会員番号・電話・メール・メモ） */
  q?: string;
  /** ステータス。"" or "all" で全部 */
  status?: string;
  /** プランID。"" で全部 */
  planId?: string;
};

/** 並び順。既定は「会員番号の若い順」＝入会順に読める */
export type MemberSort = "member_no" | "name_kana" | "join_date_desc" | "status";

export function sortMembers<T extends FrunkMemberLike>(list: T[], sort: MemberSort): T[] {
  const rank: Record<string, number> = { active: 0, pending: 1, suspended: 2, left: 3, rejected: 4 };
  const byNo = (a: T, b: T) => String(a.member_no ?? "￿").localeCompare(String(b.member_no ?? "￿"));
  const copy = [...list];
  switch (sort) {
    case "name_kana":
      return copy.sort((a, b) => normalizeKey(a.name_kana ?? a.name).localeCompare(normalizeKey(b.name_kana ?? b.name)) || byNo(a, b));
    case "join_date_desc":
      return copy.sort((a, b) => String(b.join_date ?? "").localeCompare(String(a.join_date ?? "")) || byNo(a, b));
    case "status":
      return copy.sort((a, b) => (rank[String(a.status)] ?? 9) - (rank[String(b.status)] ?? 9) || byNo(a, b));
    default:
      return copy.sort(byNo);
  }
}

export function filterMembers<T extends FrunkMemberLike>(list: T[], f: MemberFilter): T[] {
  const status = f.status ?? "";
  const planId = f.planId ?? "";
  return list.filter((m) => {
    if (status && status !== "all" && String(m.status ?? "") !== status) return false;
    if (planId && String(m.plan_id ?? "") !== planId) return false;
    return matchesMember(m, f.q ?? "");
  });
}

/** ステータス別の人数（0件のステータスも0で返す＝タブの数字が消えない） */
export function countByStatus(list: FrunkMemberLike[], statuses: string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(statuses.map((s) => [s, 0]));
  for (const m of list) {
    const s = String(m.status ?? "");
    if (s in out) out[s] += 1;
  }
  return out;
}
