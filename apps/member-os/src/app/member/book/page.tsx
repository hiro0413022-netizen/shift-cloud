import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { handoffSecret, signHandoff } from "@yozan/core/frank-handoff";
import { frankSiteUrl } from "@/lib/frank-site-link";
import { BookClient } from "./book-client";
import { createAdmin } from "@/lib/supabase/admin";
import { openSlots, slotUsageLabel } from "@yozan/core/frank-corporate";

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

  // 法人プラン（#204）: ご契約者の行は「お支払い専用」。ご利用者としてご登録いただくまで予約できない。
  // ここで止めておかないと、枠を選んでから genesis のAPIに断られる（押してから知る、を作らない）
  const corp = member.corporate;
  if (corp?.isContract && !corp.selfUse) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← 会員ページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">打席のご予約</h1>
        <p className="mt-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-4 text-sm leading-relaxed">
          ご予約は、ご利用者としてご登録された方のみお取りいただけます。<br />
          ご担当者様ご自身がご利用になる場合は、【ご利用者の管理】から「自分も利用する」をご登録ください。
        </p>
        <Link href="/member/corporate" className="mt-4 block w-full rounded-xl bg-(--color-gold) py-3.5 text-center font-semibold text-white">
          ご利用者の管理へ
        </Link>
      </main>
    );
  }

  // 御社の枠がいくつ埋まっているか（法人のみ）。押す前に見えるところへ出す
  let corpUsage: ReturnType<typeof slotUsageLabel> | null = null;
  let corpUsed = 0;
  if (corp && member.memberId) {
    const admin = createAdmin();
    const rootId = corp.parentId ?? member.memberId;
    const { data: group } = await admin
      .from("frunk_members").select("id")
      .or(`id.eq.${rootId},corporate_parent_id.eq.${rootId}`)
      .is("deleted_at", null);
    const ids = (group ?? []).map((g) => String((g as { id: string }).id));
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const nowHm = new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 16);
    const { data: rows } = await admin
      .from("frunk_bookings").select("booked_date, start_time, end_time, status")
      .in("member_id", ids.length > 0 ? ids : [rootId])
      .gte("booked_date", today).neq("status", "cancelled").is("deleted_at", null);
    const hm = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
    corpUsed = openSlots(
      (rows ?? []).map((b) => ({
        date: String(b.booked_date),
        endTime: String(b.end_time),
        minutes: hm(String(b.end_time)) - hm(String(b.start_time)),
        status: String(b.status ?? ""),
      })),
      today, nowHm,
    );
    corpUsage = slotUsageLabel({ used: corpUsed, limit: corp.maxOpenSlots, corporate: true });
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
          {member.displayName} 様（{member.memberNo}）としてご予約いただけます
        </p>
      </header>

      {/* 法人は御社ぶんの枠を分け合う。残りが見えないと、押してから断られることになる（#204） */}
      {corp && corpUsage && (
        <div className={`mb-4 rounded-xl border px-4 py-3 ${corpUsage.full ? "border-amber-500/50 bg-amber-500/5" : "border-(--color-line) bg-(--color-panel)"}`}>
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-(--color-dim)">{corp.companyName ? `${corp.companyName} 名義のご予約` : "法人名義のご予約"}</p>
            <p className="text-sm font-bold text-(--color-gold)">
              {corpUsed}<span className="text-xs font-normal text-(--color-txt)">／{corp.maxOpenSlots}コマ</span>
            </p>
          </div>
          <p className="mt-1 text-xs text-(--color-dim)">{corpUsage.detail}</p>
          {corpUsage.full && (
            <p className="mt-2 text-xs text-amber-700">
              御社のどなたかがすでに枠を使い切っています。この状態では新しいご予約をお取りいただけません。
            </p>
          )}
        </div>
      )}

      <BookClient apiBase={GENESIS_URL} token={token} />
      <p className="mt-6 text-center text-xs text-(--color-dim)">
        ご予約の確認・キャンセルは
        <Link href="/member" className="underline underline-offset-4"> 会員ページ </Link>
        から
      </p>
    </main>
  );
}
