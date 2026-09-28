/**
 * Pack（Core / Pack 分離・#306）— 会社ごとに違う「値」を Core のコードから追い出す入れ物。
 *
 * Core（Tool / Policy / Skill / Memory の仕組み）は会社を知らない。
 * 「打席予約を受ける店舗はどれか」「『姫路』と言われたらどの店か」「会員数はどの表から数えるか」は Pack が持つ。
 * YOZAN の Pack は apps/genesis/src/core/pack-yozan.ts。外販テナントは自分の Pack を持つ（無ければ DEFAULT_PACK＝汎用）。
 * ルール（藤田プロの名前を出さない 等）は Pack ではなく Memory（gn_memories・#299）に置く。Pack は「構造の違い」だけ。
 */
export type StoreAlias = { match: RegExp; like: string };
export type MemberSource = { label: string; view: string; where: string };

export type Pack = {
  name: string;
  /** 打席予約（booking.create）を受ける店舗 ID。null なら booking.create は使えない（明示エラー） */
  bookingStoreId: string | null;
  /** 会員番号で引く会員表（booking.create の member_no 解決）。null なら会員番号は受けない */
  memberTable: { table: string; storeCol: string; noCol: string } | null;
  /** 店名の言い換え → gnv_* の store_name に当てる like */
  storeAliases: StoreAlias[];
  /** members.count の数え方 */
  memberSources: MemberSource[];
  /** customer.card / person.card の出どころ名 */
  kindLabels: Record<string, string>;
};

export const DEFAULT_PACK: Pack = {
  name: "generic",
  bookingStoreId: null,
  memberTable: null,
  storeAliases: [],
  memberSources: [{ label: "会員", view: "gnv_members", where: "is_active" }],
  kindLabels: { guest: "受付台帳", member: "会員", frank: "会員", frank_guest: "ビジター" },
};

/** 店名の絞り込み。Pack の言い換えに当たればその like、無ければ部分一致 */
export function storeLikeOf(pack: Pack, v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = v.trim().toLowerCase();
  for (const a of pack.storeAliases) if (a.match.test(t)) return a.like;
  return `%${v.trim().replace(/'/g, "''")}%`;
}

export function membersCountSql(pack: Pack): string {
  return pack.memberSources.map((m) => `select '${m.label.replace(/'/g, "''")}' as store, count(*) as members from ${m.view} where ${m.where}`).join(" union all ");
}
