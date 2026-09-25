/**
 * 現金出納の残高を積み直す（#278 で money-os から core へ移した）
 *
 * balance 列は表示用のスナップショットなので、途中の行を足す・消すと以降が全部ずれる。
 * member-os からも現金の受領を記録するようになったため、同じ式を2か所に書かないよう core に置く。
 */

/** SupabaseClient の型は巨大で構造照合すると TS2589 で落ちる（frank-lesson-tickets と同方針） */
type SupabaseAdminLike = object;
type Row = Record<string, unknown>;
type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>;
type SelectChain = {
  eq(col: string, val: unknown): SelectChain;
  is(col: string, val: null): SelectChain;
  order(col: string, opts: { ascending: boolean }): SelectChain;
} & PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
type UpdateChain = { eq(col: string, val: unknown): UpdateChain } & Res<null>;
type Admin = {
  from(table: string): { select(cols: string): SelectChain; update(row: Row): UpdateChain };
};
const db = (a: SupabaseAdminLike) => a as unknown as Admin;

export async function rebalanceCashLedger(
  admin: SupabaseAdminLike,
  companyId: string,
  storeId: string,
): Promise<void> {
  const { data } = await db(admin)
    .from("mon_cash_ledger")
    .select("id, in_amount, out_amount, balance")
    .eq("company_id", companyId)
    .eq("store_id", storeId)
    .is("deleted_at", null)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });
  let bal = 0;
  for (const row of data ?? []) {
    bal += Number(row.in_amount ?? 0) - Number(row.out_amount ?? 0);
    // 変わった行だけ書き戻す（通常は末尾付近の数行）
    if (Number(row.balance) !== bal) {
      await db(admin).from("mon_cash_ledger").update({ balance: bal }).eq("id", row.id);
    }
  }
}
