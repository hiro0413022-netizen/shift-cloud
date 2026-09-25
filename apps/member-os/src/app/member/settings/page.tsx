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
    .select("billing_status, corporate_parent_id, square_subscription_id, frunk_plans(name, monthly_price)")
    .eq("company_id", member.companyId)
    .eq("member_no", member.memberNo)
    .is("deleted_at", null)
    .maybeSingle();
  const row = (m ?? null) as Row | null;
  const plan = (row?.frunk_plans ?? null) as { name?: string; monthly_price?: number | null } | null;
  const monthly = Number(plan?.monthly_price ?? 0);
  const billingStatus = String(row?.billing_status ?? "");
  const cardDone = billingStatus === "active";
  // 法人プランのご利用者（社員）は月会費を持たない＝カード登録を出さない（#206）。
  // 出すと「法人プレミアム 65,780円/月」の登録ボタンが社員全員に見え、個人にサブスクが立ってしまう。
  const isCorporateUser = !!row?.corporate_parent_id;
  // 自動課金がすでにある方（現金で前取り済みなど・#238）にも出さない＝二重登録の入口を閉じる
  const hasSubscription = !!row?.square_subscription_id;
  const showBilling = !member.isProvisional && monthly > 0 && !isCorporateUser && !(hasSubscription && !cardDone);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-6">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← 会員ページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">設定・お手続き</h1>
        <p className="text-xs text-(--color-dim)">{member.memberNo} ／ {member.name} 様</p>
      </header>

      {sp.billing === "success" && (
        <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          ✅ カードのご登録が完了しました。月会費は毎月10日に翌月分を自動でお支払いいただきます。
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
              ご登録済みです。月会費は毎月10日に翌月分を自動でお支払いいただきます。
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
              <p className="mt-2 text-[11px] text-(--color-dim)">お支払いはクレジットカードのみです。ご不明な点は店頭までお申し付けください。</p>
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

        {/* 休会・退会・キャンセルのご案内（#279・2026-09-25 ユーザー指定）。
            休会と退会の締切は「前々月の末日」＝ユーザー指定の文言をそのまま載せる。
            キャンセルは実装どおり（会員ページから開始時刻まで・キャンセル料なし）。 */}
        <div className="mt-4 space-y-4 border-t border-(--color-line) pt-4">
          <div>
            <h3 className="text-xs font-semibold text-(--color-txt)">休会について</h3>
            <p className="mt-1 text-xs leading-relaxed text-(--color-dim)">
              休会をご希望の場合は、休会したい月の<b className="text-(--color-txt)">前々月の末日まで</b>に、店頭またはお電話でお申し出ください。
              <br />
              例：1月から休会したい場合は、11月末までにお申し出ください。
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-(--color-txt)">退会について</h3>
            <p className="mt-1 text-xs leading-relaxed text-(--color-dim)">
              退会をご希望の場合は、退会したい月の<b className="text-(--color-txt)">前々月の末日まで</b>に、店頭またはお電話でお申し出ください。
              <br />
              例：1月に退会したい場合は、11月末までにお申し出ください。
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-(--color-txt)">ご予約のキャンセルについて</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-(--color-dim)">
              <li>
                打席のご予約は、<b className="text-(--color-txt)">ご利用開始時刻まで</b>、会員ページの「これからのご予約」から
                ご自身でキャンセルいただけます。<b className="text-(--color-txt)">キャンセル料はいただいておりません。</b>
              </li>
              <li>
                ご来店の受付が済んだご予約は、会員ページからは取り消せません。受付までお申し付けください。
              </li>
              <li>
                パーソナルレッスンをご一緒にご予約いただいていた場合、キャンセルすると
                <b className="text-(--color-txt)">レッスンチケットは自動でお戻しします</b>（残数に戻ります）。
              </li>
              <li>
                体験レッスンのご予約は会員ページには表示されません。変更・キャンセルは店頭またはお電話でお願いいたします。
              </li>
              <li>
                ご都合が悪くなった場合は、次の方にお席をお譲りできますので、お早めのご連絡にご協力ください。
              </li>
            </ul>
          </div>
        </div>

        <a
          href={frankSiteUrl("faq.html", null)}
          className="mt-4 block rounded-xl border border-(--color-line) bg-white py-3 text-center text-sm text-(--color-txt) transition-colors hover:bg-(--color-panel-2)"
        >
          よくあるご質問
        </a>
      </section>
    </main>
  );
}
