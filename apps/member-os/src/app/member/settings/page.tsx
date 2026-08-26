import Link from "next/link";
import { requireMember } from "@/lib/member";
import { frankSiteUrl } from "@/lib/frank-site-link";
import { reissueMyQr } from "./actions";

export const dynamic = "force-dynamic";

/** 会員ポータルの設定・お手続き（#154） */
export default async function MemberSettingsPage() {
  const member = await requireMember();

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-6">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← マイページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">設定・お手続き</h1>
        <p className="text-xs text-(--color-dim)">{member.memberNo} ／ {member.name} 様</p>
      </header>

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
