"use server";

import { requireGenesisActor, storeScope } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { searchNav } from "@/lib/nav";
import { storeInValues } from "@/lib/kernel";
import { MEMBER_OS_URL, LESSON_OS_URL } from "@/lib/store-links";

/**
 * Ctrl K の横断検索（#244 ⑤）。
 * 画面（nav.ts）と お客様（受付台帳＋FRANK会員）を1回で返す。
 * - 受付台帳は mbr_search_people（#130/0180・人単位に名寄せ済み）をそのまま使う＝別の検索を書かない
 * - FRANK会員は frunk_members を氏名/カナ/会員番号/電話で引く（frunk-member-search と同じ列）
 * - 店舗スコープ（#134）: オーナー以外は自店舗の人しか出さない
 */
export type SearchHit =
  | { kind: "screen"; href: string; label: string; sub: string }
  | {
      kind: "person";
      key: string;
      name: string;
      sub: string;
      /** その人にすること（外部アプリへの深リンク） */
      actions: { label: string; href: string; external: boolean }[];
    };

export async function searchEverything(q: string): Promise<SearchHit[]> {
  const actor = await requireGenesisActor();
  const query = String(q ?? "").trim();
  if (!query) return [];
  const hits: SearchHit[] = [];

  for (const it of searchNav(query, 5)) {
    hits.push({ kind: "screen", href: it.href, label: it.label, sub: it.groupLabel });
  }
  if (query.length < 2) return hits;

  const admin = createAdmin();
  const scope = storeScope(actor);
  const allowed = Array.isArray(scope) ? new Set(scope) : null;

  const [people, frank] = await Promise.all([
    admin
      .rpc("mbr_search_people", {
        p_company_id: actor.companyId,
        // オーナーは全店（null）、それ以外は主所属の店（RPC は1店舗しか受けないため）
        p_store_id: actor.isOwner ? null : actor.primaryStoreId,
        p_q: query,
        p_limit: 6,
      })
      .then((r) => (r.error ? [] : ((r.data ?? []) as Record<string, unknown>[]))),
    (() => {
      const digits = query.replace(/\D/g, "");
      let qb = admin
        .from("frunk_members")
        .select("id, name, name_kana, member_no, phone, status, store_id")
        .eq("company_id", actor.companyId)
        .is("deleted_at", null)
        .in("status", ["active", "suspended", "pending"])
        .limit(6);
      qb = qb.or(
        [
          `name.ilike.%${query}%`,
          `name_kana.ilike.%${query}%`,
          `member_no.ilike.%${query}%`,
          digits.length >= 4 ? `phone.ilike.%${digits}%` : null,
        ]
          .filter(Boolean)
          .join(",")
      );
      if (allowed) qb = qb.in("store_id", storeInValues(allowed));
      return qb.then((r) => (r.error ? [] : ((r.data ?? []) as Record<string, unknown>[])));
    })(),
  ]);

  for (const m of frank) {
    const name = String(m.name ?? "");
    const no = m.member_no ? String(m.member_no) : "承認待ち";
    const tail = m.phone ? `・${String(m.phone).slice(-4)}` : "";
    hits.push({
      kind: "person",
      key: `frank-${String(m.id)}`,
      name: `${name} 様`,
      sub: `FRANK GOLF ${no}${tail}`,
      actions: [
        { label: "会員カード", href: `${MEMBER_OS_URL}/frunk/${String(m.id)}`, external: true },
        { label: "予約を入れる", href: `${MEMBER_OS_URL}/reservations`, external: true },
        { label: "カルテ", href: `${LESSON_OS_URL}/students?q=${encodeURIComponent(name)}`, external: true },
      ],
    });
  }
  for (const p of people) {
    const name = String(p.name ?? "");
    const visits = Number(p.visits ?? 0);
    const last = p.last_seen_at ? String(p.last_seen_at).slice(0, 10).replace(/-/g, "/") : "";
    const tail = p.phone ? `・${String(p.phone).slice(-4)}` : "";
    hits.push({
      kind: "person",
      key: `guest-${String(p.name_key ?? name)}`,
      name: `${name} 様`,
      sub: `受付台帳 ${visits}回${last ? `・最終 ${last}` : ""}${tail}${p.is_member ? "・会員" : ""}`,
      actions: [
        { label: "受付台帳で開く", href: `${MEMBER_OS_URL}/search?q=${encodeURIComponent(name)}`, external: true },
        { label: "カルテ", href: `${LESSON_OS_URL}/students?q=${encodeURIComponent(name)}`, external: true },
      ],
    });
  }
  return hits;
}
