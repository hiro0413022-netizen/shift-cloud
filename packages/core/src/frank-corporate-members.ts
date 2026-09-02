/**
 * 法人プラン: ご利用者ぶんの会員行を作り、会員番号を発行する（#195・2026-09-01）
 *
 * 入口が2つある（Web入会の入金確定＝genesis／店頭の承認＝member-os）ので、
 * 「どんな行を作るか」はここ1か所に置く。会員番号の採番はアプリごとに実装があるため
 * assignMemberNo をコールバックで受ける。
 *
 * ★ なぜ人数ぶん行を作るのか
 *   会員番号を会社で1つ使い回すと「誰が来たか」が残らず、レッスンカルテも分けられない。
 *   お一人ずつ会員番号を出せば、ご予約も会員証QRも普段の会員と同じ仕組みがそのまま使える。
 *
 * ★ お金は増やさない
 *   月会費のサブスク（square_subscription_id）を持つのは契約者の行だけ。
 *   利用者の行には決済情報を入れない。ここを間違えると人数分の請求が立つ。
 *
 * ★ 予約の枠は会社で共有する
 *   corporate_parent_id で契約者にぶら下げ、予約の上限は親子をまとめて数える（法人合計4/8コマ）。
 *
 * 何度呼ばれても増えない（親＋電話番号で既存を探す）。1人失敗しても他は続ける。
 */

/** Supabase admin クライアント。SupabaseClient の型は巨大で構造照合すると TS2589 で落ちるため、
 *  受け取るときは検査せず、使う直前に必要な形へキャストする（fitting-walkin.ts と同じ方針）。 */
type SupabaseAdminLike = object;

type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>;
type Row = Record<string, unknown>;
type Chain = {
  eq(col: string, val: unknown): Chain;
  is(col: string, val: null): Chain;
  maybeSingle(): Res<Row | null>;
};
type Inserted = { select(cols: string): { maybeSingle(): Res<Row | null> } };
type Table = {
  select(cols: string): Chain;
  insert(row: Row): Inserted;
};
type Admin = { from(table: string): Table };

const db = (a: SupabaseAdminLike) => a as unknown as Admin;

export type CorporateUserInput = {
  name?: string;
  nameKana?: string | null;
  birthDate?: string | null;
  phone?: string;
  email?: string | null;
};

export async function createCorporateUserMembers(
  adminClient: SupabaseAdminLike,
  input: {
    id: string;
    company_id: string;
    store_id?: string | null;
    plan_id?: string | null;
    company_name: string | null;
    corporate_users: CorporateUserInput[] | null;
    today: string;
    assignMemberNo: (memberId: string) => Promise<string | null>;
    onCreated?: (u: { id: string; name: string; memberNo: string }) => Promise<void>;
  },
): Promise<Array<{ id: string; name: string; memberNo: string }>> {
  const admin = db(adminClient);
  const rows = input.corporate_users ?? [];
  if (rows.length === 0) return [];
  const out: Array<{ id: string; name: string; memberNo: string }> = [];

  for (const u of rows) {
    const name = String(u?.name ?? "").trim();
    const phone = String(u?.phone ?? "").trim();
    if (!name || !phone) continue;
    try {
      const { data: existing } = await admin
        .from("frunk_members")
        .select("id, member_no")
        .eq("corporate_parent_id", input.id)
        .eq("phone", phone)
        .is("deleted_at", null)
        .maybeSingle();
      let id = existing?.id ? String(existing.id) : "";
      const already = existing?.member_no ? String(existing.member_no) : "";
      if (!id) {
        const { data: created, error } = await admin
          .from("frunk_members")
          .insert({
            company_id: input.company_id,
            store_id: input.store_id ?? null,
            plan_id: input.plan_id ?? null,
            corporate_parent_id: input.id,
            company_name: input.company_name,
            name,
            name_kana: u?.nameKana ?? null,
            birth_date: u?.birthDate ?? null,
            phone,
            email: u?.email ?? null,
            status: "active",
            join_date: input.today,
            payment_method: "credit",
            consent_privacy: true,
            consent_terms: true,
            note: `法人プランのご利用者（契約: ${input.company_name ?? ""}）月会費は契約者にご請求`,
          })
          .select("id")
          .maybeSingle();
        if (error || !created) {
          console.error("[frank-corporate] user insert failed:", error);
          continue;
        }
        id = String((created as { id: string }).id);
      }
      const memberNo = already || (await input.assignMemberNo(id));
      if (!memberNo) continue;
      out.push({ id, name, memberNo });
      if (!already && input.onCreated) await input.onCreated({ id, name, memberNo });
    } catch (e) {
      console.error("[frank-corporate] user failed:", e);
    }
  }
  return out;
}
