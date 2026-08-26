import Link from "next/link";
import { requireMember } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { loadMenu, currentVisit, bayByCode } from "@/lib/frank-portal";
import { submitOrder } from "./actions";
import { OrderForm } from "./order-form";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/** 会員のモバイルオーダー（#154）。打席は チェックイン or 打席QR から決まる。 */
export default async function MemberOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ bay?: string; err?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const admin = createAdmin();

  const { data: m } = await admin
    .from("frunk_members").select("id")
    .eq("company_id", member.companyId).eq("member_no", member.memberNo)
    .is("deleted_at", null).maybeSingle();
  const memberId = (m as Row | null)?.id as string | undefined;

  const visit = memberId ? await currentVisit(memberId) : null;
  const bay = sp.bay ? await bayByCode(sp.bay) : null;
  const bayName = bay?.name ?? visit?.bayName ?? null;
  const bayCode = bay?.code ?? visit?.bayCode ?? null;

  const menu = await loadMenu(member.companyId);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-5">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← マイページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">ご注文</h1>
        <p className="text-xs text-(--color-dim)">{bayName ? `${bayName}へお持ちします` : "打席はスタッフが確認します"}</p>
      </header>

      {sp.err && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          商品が選ばれていません。
        </p>
      )}

      {menu.length === 0 ? (
        <p className="py-10 text-center text-sm text-(--color-dim)">ただいま注文を受け付けていません</p>
      ) : (
        <OrderForm menu={menu} priceKind="member" bayCode={bayCode} bayName={bayName} action={submitOrder} />
      )}
    </main>
  );
}
