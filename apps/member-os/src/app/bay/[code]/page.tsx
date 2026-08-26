import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMemberSession, resolveHimeji } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { bayByCode, loadMenu, currentVisit, checkInMember, assignBay } from "@/lib/frank-portal";
import { submitGuestOrder } from "./actions";
import { OrderForm } from "../../member/order/order-form";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * 打席QRの入口（#154 / 構想 §6）
 *
 * ★ 会員用QRとビジター用QRを分けない。 打席に貼るのはこの1本のURLだけ。
 *   読んだ人が誰かは「開いた瞬間のログイン状態」で自動的に決まるので、
 *   お客様が間違ったQRを読むということ自体が起きない。
 *
 *   ログイン済みの会員 → いつものポータル（注文画面）が打席セット済みで開く。会員価格・登録カードで決済
 *   未ログイン         → その場でビジター注文。名前も登録も不要。伝票に溜めて退店時に会計
 *
 * 未ログインの会員は「会員価格になります」で誘導する（値段が違うので、これが一番効く）。
 */
export default async function BayPage({
  params, searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const bay = await bayByCode(code);
  if (!bay) notFound();

  const session = await getMemberSession();

  // --- 会員（ログイン済み）: いつものポータルへ ---------------------
  if (session) {
    const admin = createAdmin();
    const { data: m } = await admin
      .from("frunk_members").select("id")
      .eq("company_id", session.companyId).eq("member_no", session.memberNo)
      .is("deleted_at", null).maybeSingle();
    const memberId = (m as Row | null)?.id as string | undefined;
    if (memberId) {
      // まだチェックインしていなければ、ここで済ませる（打席QRを読んだ＝来店している）
      const visit = await currentVisit(memberId);
      if (!visit.checkedIn) {
        const r = await checkInMember(memberId, "bay");
        if (r.ok && r.checkinId) await assignBay(r.checkinId, bay.id);
      } else if (visit.bayId !== bay.id && visit.checkinId) {
        // 予約と違う打席のQRを読んだときは、実際に読んだ打席を正とする
        await assignBay(visit.checkinId, bay.id);
      }
      redirect(`/member/order?bay=${encodeURIComponent(bay.code)}`);
    }
  }

  // --- ビジター（未ログイン） --------------------------------------
  const store = await resolveHimeji();
  const menu = store ? await loadMenu(store.companyId) : [];

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-4">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF</p>
        <h1 className="mt-1 text-xl font-bold tracking-wide">{bay.name} からのご注文</h1>
        <p className="text-xs text-(--color-dim)">お会計は退店時に受付でお願いします</p>
      </header>

      {/* 未ログインの会員をここで会員に戻す。値段が違うので、これが一番効く */}
      <Link
        href="/member/login"
        className="mb-5 block rounded-xl border border-(--color-gold)/50 bg-(--color-panel) px-4 py-3 text-center text-sm text-(--color-txt) transition-colors hover:bg-(--color-panel-2)"
      >
        <span className="font-semibold text-(--color-gold)">会員の方はログイン</span>
        <span className="mt-0.5 block text-xs text-(--color-dim)">会員価格になり、ご登録のカードでお支払いできます</span>
      </Link>

      {sp.ok && (
        <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{sp.ok}</p>
      )}
      {sp.err && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">商品が選ばれていません。</p>
      )}

      {menu.length === 0 ? (
        <p className="py-10 text-center text-sm text-(--color-dim)">ただいま注文を受け付けていません</p>
      ) : (
        <OrderForm menu={menu} priceKind="general" bayCode={bay.code} bayName={bay.name} action={submitGuestOrder} />
      )}
    </main>
  );
}
