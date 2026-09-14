import "server-only";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * お客様（人）。
 *
 * 受付台帳 mbr_guests は「人」ではなく「受付1回」の記録で、6,251行あってもお名前は
 * 2,009通りしかない（同じ方が何十行も入っている）。そのまま並べると同じ方が何度も出るので、
 * DB側（mbr_search_people）でお名前ごとに束ねてから受け取る。
 */
export type Person = {
  /** 空白を抜いたお名前。同じ方かどうかの判定はこれで行う */
  nameKey: string;
  /** 画面に出すお名前（いちばん新しい受付のときの書き方） */
  name: string;
  nameKana: string | null;
  /** 電話の下4桁だけを持つ。店頭で他の方の番号を全部出さないため（#226と同じ考え方） */
  phoneLast4: string | null;
  /** 受付回数 */
  visits: number;
  lastSeenOn: string | null;
  /** 在籍中の会員名簿に同じお名前がいるか */
  isMember: boolean;
};

type Row = {
  name_key: string;
  name: string | null;
  name_kana: string | null;
  phone: string | null;
  visits: number | null;
  last_seen_at: string | null;
  is_member: boolean | null;
};

const last4 = (v: string | null): string | null => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d ? d.slice(-4) : null;
};

/**
 * お名前・フリガナ・お電話でお客様を探す。
 * q が空のときは「よく来られる方」から順に返す＝開いた瞬間に候補が出る。
 */
export async function searchPeople(
  companyId: string,
  storeId: string | null,
  q: string,
  limit = 20
): Promise<Person[]> {
  const { data, error } = await createAdmin().rpc("mbr_search_people", {
    p_company_id: companyId,
    p_store_id: storeId,
    p_q: q ?? "",
    p_limit: limit,
  });
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({
    nameKey: r.name_key,
    name: (r.name ?? "").trim(),
    nameKana: r.name_kana,
    phoneLast4: last4(r.phone),
    visits: Number(r.visits ?? 0),
    lastSeenOn: r.last_seen_at ? String(r.last_seen_at).slice(0, 10) : null,
    isMember: !!r.is_member,
  }));
}

/**
 * 売上明細を引くときのお名前の候補。
 * 台帳（Excel取込）側は「西原 康夫」「西原　康夫」「西原康夫」が混ざっているので、
 * 3通りに展開してから等号で引く（PostgRESTの絞り込みに関数が使えないため）。
 */
export function nameVariants(name: string): string[] {
  const t = String(name ?? "").trim();
  if (!t) return [];
  const bare = t.replace(/[\s　]/g, "");
  const out = new Set<string>([t, bare]);
  // 姓名の切れ目が分かるものは、半角/全角スペース入りも足す
  const m = t.match(/^(\S+)[\s　]+(\S.*)$/);
  if (m) {
    out.add(`${m[1]} ${m[2]}`);
    out.add(`${m[1]}　${m[2]}`);
  }
  return [...out];
}
