"use server";

import { requireGenesisActor, storeScope } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { searchNav } from "@/lib/nav";
import { storeInValues } from "@/lib/kernel";
import { MEMBER_OS_URL, LESSON_OS_URL } from "@/lib/store-links";
import { semanticSearch } from "@yozan/genesis-core/semantic";
import { embedTexts, hasEmbedKey } from "@yozan/genesis-core/embed";

/**
 * Ctrl K の横断検索（#244 ⑤）。
 * 画面（nav.ts）と お客様（受付台帳＋FRANK会員）を1回で返す。
 * - 受付台帳は mbr_search_people（#130/0180・人単位に名寄せ済み）をそのまま使う＝別の検索を書かない
 * - FRANK会員は frunk_members を氏名/カナ/会員番号/電話で引く（frunk-member-search と同じ列）
 * - 店舗スコープ（#134）: オーナー以外は自店舗の人しか出さない
 */
export type SearchHit =
  | { kind: "screen"; href: string; label: string; sub: string }
  /** #301 Universal Search: 文章（レッスンコメント・会話メモ・記憶）の意味検索と、記憶の文字一致 */
  | { kind: "text"; href: string; label: string; sub: string }
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

  // #301: Genesis の記憶（文字一致・軽い）と、文章の意味検索（6文字以上・GEMINI_API_KEY があるときだけ。埋め込み1回≒数トークン）
  const [memories, texts] = await Promise.all([
    admin
      .from("gn_memories")
      .select("id, scope, value, confidence")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .in("scope", actor.isOwner ? ["company", "store", "project", "user", "customer"] : ["company", "store"])
      .ilike("value", `%${query.replace(/[%_]/g, "")}%`)
      .limit(3)
      .then((r) => (r.error ? [] : ((r.data ?? []) as Record<string, unknown>[])), () => [] as Record<string, unknown>[]),
    query.length >= 6 && hasEmbedKey()
      ? (async () => {
          try {
            const { toCoreActor, buildGenesisContext } = await import("@/core/actor");
            const ctx = await buildGenesisContext(admin, await toCoreActor(admin, actor), actor.companyId, { surface: "web", enrich: false });
            return await semanticSearch(admin, ctx, (t, k) => embedTexts(t, k, { admin, companyId: actor.companyId }), query, { limit: 4 });
          } catch {
            return [];
          }
        })()
      : Promise.resolve([]),
  ]);
  for (const m of memories) {
    hits.push({ kind: "text", href: "/memories", label: String(m.value).slice(0, 60), sub: `記憶（${String(m.scope)}）${Number(m.confidence) < 1 ? "・推定" : ""}` });
  }
  for (const t of texts.filter((x) => x.similarity >= 0.55)) {
    hits.push({ kind: "text", href: `/?ask=${encodeURIComponent(`「${query}」に近い過去のコメントや会話メモを探して`)}`, label: t.chunk.replace(/\s+/g, " ").slice(0, 70), sub: `${t.label}${t.at ? "・" + t.at : ""}・${t.title}` });
  }

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
