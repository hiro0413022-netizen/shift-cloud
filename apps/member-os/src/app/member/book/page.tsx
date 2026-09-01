import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { handoffSecret, signHandoff } from "@yozan/core/frank-handoff";
import { frankSiteUrl } from "@/lib/frank-site-link";
import { BookClient } from "./book-client";

/**
 * 打席のWeb予約（会員ポータル内・#188）
 *
 * 旧: このURLは frankgolf.jp/booking.html への転送だった（#93 で受付口を公式サイトに一本化した名残）。
 * 新: ユーザー判断（2026-09-01）「お客様が入るページは会員ポータルだけにしたい」に合わせ、
 *     予約画面をここに置く。**台帳と予約APIは1つのまま**で、変わるのはお客様が見る場所だけ。
 *
 * 引き渡しトークン（#152）が作れないとき（鍵未設定）は、従来どおり公式サイトへ転送して
 * 会員番号＋電話下4桁で予約してもらう＝予約できない状態は作らない。
 */
export const dynamic = "force-dynamic";

const GENESIS_URL = process.env.GENESIS_URL || "https://yozan-genesis.vercel.app";

export default async function MemberBookPage() {
  const member = await requireMember();

  // 仮会員は打席予約ができない（#120）。入口で伝える＝予約画面で弾かれるより親切
  if (member.isProvisional) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← 会員ページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">打席のご予約</h1>
        <p className="mt-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-4 text-sm leading-relaxed">
          ご入会の手続きが完了すると、こちらから打席をご予約いただけます。
          お手続きの状況は受付までお問い合わせください。
        </p>
      </main>
    );
  }

  const secret = handoffSecret();
  if (!secret) redirect(frankSiteUrl("booking.html", member.memberNo));
  const token = signHandoff(member.memberNo, secret);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-5">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← 会員ページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">打席のご予約</h1>
        <p className="text-xs text-(--color-dim)">
          {member.name} 様（{member.memberNo}）としてご予約いただけます
        </p>
      </header>
      <BookClient apiBase={GENESIS_URL} token={token} />
      <p className="mt-6 text-center text-xs text-(--color-dim)">
        ご予約の確認・キャンセルは
        <Link href="/member" className="underline underline-offset-4"> 会員ページ </Link>
        から
      </p>
    </main>
  );
}
