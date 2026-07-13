import Link from "next/link";
import { requireMember, resolveHimeji } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { BOOKING_STATUS_LABEL } from "@/lib/reservation";
import { memberLogout, cancelMyBooking } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const notices: Record<string, { text: string; ok?: boolean }> = {
  booked: { text: "ご予約を受け付けました。", ok: true },
  canceled: { text: "予約をキャンセルしました。", ok: true },
  registered: { text: "会員登録が完了しました。さっそくWeb予約をご利用ください。", ok: true },
};

export default async function MemberHomePage({
  searchParams,
}: {
  searchParams: Promise<{ booked?: string; canceled?: string; registered?: string; err?: string }>;
}) {
  const member = await requireMember();
  const store = await resolveHimeji();
  const admin = createAdmin();
  const sp = await searchParams;

  const [{ data: bookings }, { data: resources }] = await Promise.all([
    admin.from("res_bookings")
      .select("id, resource_id, booking_date, start_time, status, customer_kind, party_size")
      .eq("company_id", member.companyId).eq("member_no", member.memberNo)
      .is("deleted_at", null)
      .order("booking_date", { ascending: false }).order("start_time", { ascending: false }),
    admin.from("res_resources").select("id, name").eq("store_id", store?.storeId ?? "").is("deleted_at", null),
  ]);

  const resName = new Map((resources ?? []).map((r) => [String((r as Row).id), String((r as Row).name)]));
  const all = (bookings ?? []) as Row[];
  const t = today();
  const upcoming = all.filter((b) => String(b.booking_date) >= t && b.status !== "canceled");
  const past = all.filter((b) => String(b.booking_date) < t || b.status === "canceled").slice(0, 20);

  const notice = sp.booked ? notices.booked : sp.canceled ? notices.canceled : sp.registered ? notices.registered : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRUNK GOLF 姫路</p>
          <h1 className="text-xl font-bold tracking-wide">{member.name} 様</h1>
          <p className="text-xs text-(--color-dim)">会員番号 {member.memberNo}{member.isProvisional ? "（仮登録）" : ""}</p>
        </div>
        <form action={memberLogout}>
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs text-(--color-dim) hover:text-(--color-txt)">ログアウト</button>
        </form>
      </header>

      {notice && <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice.text}</p>}
      {sp.err && <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{sp.err}</p>}

      <Link href="/member/book" className="mb-6 block w-full rounded-xl bg-sky-600 py-4 text-center text-lg font-semibold text-white transition-all hover:bg-sky-500">
        ＋ Web予約する
      </Link>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-(--color-dim)">これからのご予約</h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-5 text-center text-sm text-(--color-dim)">現在ご予約はありません</div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => (
              <div key={String(b.id)} className="flex items-center justify-between gap-2 rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
                <div>
                  <p className="font-semibold">{String(b.booking_date)} {String(b.start_time).slice(0, 5)}</p>
                  <p className="text-xs text-(--color-dim)">{resName.get(String(b.resource_id)) ?? "枠"}{b.party_size ? ` ・ ${String(b.party_size)}名` : ""}</p>
                </div>
                <form action={cancelMyBooking}>
                  <input type="hidden" name="id" value={String(b.id)} />
                  <button className="rounded-lg border border-(--color-line) px-3 py-2 text-xs text-(--color-dim) hover:text-red-400">キャンセル</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-(--color-dim)">これまでのご利用</h2>
        {past.length === 0 ? (
          <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-5 text-center text-sm text-(--color-dim)">履歴はありません</div>
        ) : (
          <div className="space-y-1.5">
            {past.map((b) => (
              <div key={String(b.id)} className="flex items-center justify-between rounded-lg border border-(--color-line) bg-(--color-panel-2) px-4 py-2.5 text-sm">
                <span>{String(b.booking_date)} {String(b.start_time).slice(0, 5)} ・ {resName.get(String(b.resource_id)) ?? "枠"}</span>
                <span className="text-xs text-(--color-dim)">{BOOKING_STATUS_LABEL[String(b.status)] ?? String(b.status)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
