import Link from "next/link";
import { requireMember } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { frankSiteUrl } from "@/lib/frank-site-link";
import { reissueMyQr, startBillingCheckout } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/** 会員ポータルの設定・お手続き（#154／#188 で月会費のカード登録を追加） */
export default async function MemberSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; err?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;

  // 月会費のカード登録は「まだ登録できていない人」にだけ出す（済んだ人に押させない）
  const admin = createAdmin();
  const { data: m } = await admin
    .from("frunk_members")
    .select("billing_status, frunk_plans(name, monthly_price)")
    .eq("company_id", member.companyId)
    .eq("member_no", member.memberNo)
    .is("deleted_at", null)
    .maybeSingle();
  const row = (m ?? null) as Row | null;
  const plan = (row?.frunk_plans ?? null) as { name?: string; monthly_price?: number | null } | null;
  const monthly = Number(plan?.monthly_price ?? 0);
  const billingStatus = String(row?.billing_status ?? "");
  const cardDone = billingStatus === "active";
  const showBilling = !member.isProvisional && monthly > 0;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-6">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← 会員ページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">設定・お手続き</h1>
        <p className="text-xs text-(--color-dim)">{member.memberNo} ／ {member.name} 様</p>
      </header>

      {sp.billing === "success" && (
        <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          ✅ カードのご登録が完了しました。月会費は毎月自動でお支払いになります。
        </p>
      )}
      {sp.billing === "cancel" && (
        <p className="mb-4 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-dim)">
          カードのご登録は完了していません。もう一度お試しいただけます。
        </p>
      )}
      {sp.err && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{sp.err}</p>
      )}

      {showBilling && (
        <section className="mb-5 rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
          <h2 className="text-sm font-semibold">月会費のお支払い（クレジットカード）</h2>
          {cardDone ? (
            <p className="mt-1 text-xs leading-relaxed text-(--color-dim)">
              ご登録済みです。月会費は毎月自動でお支払いになります。
              カードの変更・お支払い方法の変更は受付までお申し付けください。
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs leading-relaxed text-(--color-dim)">
                {plan?.name ? `${plan.name}（月会費 ${Math.round(monthly * 1.1).toLocaleString()}円・税込）` : "月会費"}
                のお支払いカードをご登録いただけます。
                安全な決済ページ（Square）に移動します。
              </p>
              <form action={startBillingCheckout} className="mt-3">
                <button className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-500">
                  カードを登録する
                </button>
              </form>
              <p className="mt-2 text-[11px] text-(--color-dim)">口座振替をご希望の方は店頭でお手続きください。</p>
            </>
          )}
        </section>
      )}

      <section className="mb-5 rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
        <h2 className="text-sm font-semibold">会員証QRコード</h2>
        <p className="mt-1 text-xs leading-relaxed text-(--color-dim)">
          スクリーンショットが他の方に渡ってしまった場合は再発行してください。
          再発行すると古いQRコードはその場で使えなくなります。
        </p>
        <form action={reissueMyQr} className="mt-3">
          <button className="w-full rounded-xl border border-(--color-line) bg-white py-3 text-sm font-medium text-(--color-txt) transition-colors hover:bg-(--color-panel-2)">
            会員証QRを再発行する
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
        <h2 className="text-sm font-semibold">お手続き</h2>
        <p className="mt-1 text-xs leading-relaxed text-(--color-dim)">
          連絡先の変更・休会・退会・プラン変更・お支払い方法の変更は、受付またはお電話で承っています。
          Webからのお手続きは順次ご用意します。
        </p>
        <a
          href={frankSiteUrl("faq.html", null)}
          className="mt-3 block rounded-xl border border-(--color-line) bg-white py-3 text-center text-sm text-(--color-txt) transition-colors hover:bg-(--color-panel-2)"
        >
          よくあるご質問
        </a>
      </section>
    </main>
  );
}
