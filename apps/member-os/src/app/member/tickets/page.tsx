import Link from "next/link";
import { requireMember } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { ticketBalance, pendingTicketCount, listTickets, ticketRowLabel } from "@yozan/core/frank-lesson-tickets";
import { ticketPrice } from "@/lib/frank-tickets";
import { buyTickets } from "./actions";
import { TicketBuyForm } from "./buy-form";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * レッスンチケット（#199）
 *
 * お客様が知りたいのは「あと何枚か」だけ。まずそれを大きく出し、
 * その下に「増やす（購入）」と「なぜその枚数なのか（履歴）」を置く。
 */
export default async function MemberTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const admin = createAdmin();

  const { data: m } = await admin
    .from("frunk_members").select("id")
    .eq("company_id", member.companyId).eq("member_no", member.memberNo)
    .is("deleted_at", null).maybeSingle();
  const memberId = (m as Row | null)?.id as string | undefined;

  const [balance, pending, history, price] = memberId
    ? await Promise.all([
        ticketBalance(admin, memberId),
        pendingTicketCount(admin, memberId),
        listTickets(admin, memberId, 30),
        ticketPrice(),
      ])
    : [0, 0, [], await ticketPrice()];

  const ymd = (s: string) => String(s).slice(0, 10).replace(/-/g, "/");

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-5">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← マイページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">レッスンチケット</h1>
        <p className="text-xs text-(--color-dim)">パーソナルレッスン{price.minutes}分・1枚で1回</p>
      </header>

      {sp.msg && <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{sp.msg}</p>}
      {sp.err && <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{sp.err}</p>}

      {/* 残枚数 */}
      <section className="mb-4 rounded-2xl border border-(--color-gold)/40 bg-(--color-panel) p-6 text-center">
        <p className="text-xs tracking-widest text-(--color-dim)">ただいまの保有枚数</p>
        <p className="mt-1 text-5xl font-bold text-(--color-gold)">
          {balance}
          <span className="ml-1 text-lg font-semibold text-(--color-txt)">枚</span>
        </p>
        <p className="mt-2 text-xs text-(--color-dim)">有効期限はありません（ご在籍中はいつでもお使いいただけます）</p>
        {pending > 0 && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            お支払い待ちが{pending}枚あります。次回ご来店時に受付でお支払いください。
          </p>
        )}
      </section>

      {/* ご予約について（枚数だけ見せて終わらせない） */}
      <p className="mb-4 rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3 text-xs leading-relaxed text-(--color-dim)">
        打席のご予約のときに「パーソナルレッスンを追加」をお選びください。チケットをお持ちの場合はチケットで承ります。
      </p>

      {/* ご購入 */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-(--color-dim)">チケットを購入する</h2>
        <TicketBuyForm
          unitTaxIncluded={price.unitTaxIncluded}
          minutes={price.minutes}
          action={buyTickets}
        />
      </section>

      {/* 履歴 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-(--color-dim)">これまでの記録</h2>
        {history.length === 0 ? (
          <p className="rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-6 text-center text-xs text-(--color-dim)">
            まだ記録はありません
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{ticketRowLabel(r)}</p>
                  <p className="text-[11px] text-(--color-dim)">
                    {ymd(r.created_at)}
                    {r.amount ? ` ・ ${r.amount.toLocaleString("ja-JP")}円` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    r.status === "void" ? "text-(--color-dim) line-through" : r.qty > 0 ? "text-emerald-600" : "text-(--color-txt)"
                  }`}
                >
                  {r.qty > 0 ? `＋${r.qty}` : `${r.qty}`}枚
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
