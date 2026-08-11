import Link from "next/link";
import { requireMember, resolveHimeji } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { BOOKING_STATUS_LABEL, jstToday } from "@yozan/core/frank-booking";
import { memberLogout, cancelMyBooking } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

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

  // 台帳は frunk_bookings 一本（#93）。会員は member_no → frunk_members.id で引く
  const { data: me } = await admin
    .from("frunk_members").select("id")
    .eq("company_id", member.companyId).eq("member_no", member.memberNo)
    .is("deleted_at", null).maybeSingle();

  // レッスンカルテ（Lesson OS・#129）: member_no ⇄ lsn_students.member_code、閲覧は共有トークン
  let karteUrl: string | null = null;
  {
    const { data: student } = await admin
      .from("lsn_students").select("id")
      .eq("company_id", member.companyId).eq("member_code", member.memberNo)
      .is("deleted_at", null).limit(1).maybeSingle();
    if (student) {
      const { data: tok } = await admin
        .from("lsn_share_tokens").select("token")
        .eq("student_id", student.id).is("revoked_at", null).limit(1).maybeSingle();
      if (tok?.token) {
        const base = process.env.NEXT_PUBLIC_LESSON_OS_URL || "https://lesson-os.vercel.app";
        karteUrl = `${base}/s/${String(tok.token)}`;
      }
    }
  }

  const { data: bookings } = me
    ? await admin
        .from("frunk_bookings")
        .select("id, booked_date, start_time, end_time, status, party_size, frunk_bays(name)")
        .eq("member_id", me.id)
        .is("deleted_at", null)
        .order("booked_date", { ascending: false })
        .order("start_time", { ascending: false })
    : { data: [] };

  const all = (bookings ?? []) as Row[];
  const t = jstToday();
  const bayName = (b: Row) => (b.frunk_bays as { name?: string } | null)?.name ?? "打席";
  const upcoming = all.filter((b) => String(b.booked_date) >= t && b.status !== "cancelled");
  const past = all.filter((b) => String(b.booked_date) < t || b.status === "cancelled").slice(0, 20);

  const notice = sp.booked ? notices.booked : sp.canceled ? notices.canceled : sp.registered ? notices.registered : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF 姫路</p>
          <h1 className="text-xl font-bold tracking-wide">{member.name} 様</h1>
          <p className="text-xs text-(--color-dim)">会員番号 {member.memberNo}{member.isProvisional ? "（仮登録）" : ""}</p>
        </div>
        <form action={memberLogout}>
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs text-(--color-dim) hover:text-(--color-txt)">ログアウト</button>
        </form>
      </header>

      {notice && <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice.text}</p>}
      {sp.err && <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{sp.err}</p>}

      <a href="https://frankgolf.jp/booking.html" className="mb-3 block w-full rounded-xl bg-sky-600 py-4 text-center text-lg font-semibold text-white transition-all hover:bg-sky-500">
        ＋ Web予約する
      </a>
      {karteUrl && (
        <a href={karteUrl} target="_blank" rel="noreferrer" className="mb-6 block w-full rounded-xl border border-(--color-gold)/50 bg-(--color-panel) py-3.5 text-center font-semibold text-(--color-gold) transition-all hover:bg-(--color-panel-2)">
          📋 レッスンカルテを見る
        </a>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-(--color-dim)">これからのご予約</h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-5 text-center text-sm text-(--color-dim)">現在ご予約はありません</div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => (
              <div key={String(b.id)} className="flex items-center justify-between gap-2 rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
                <div>
                  <p className="font-semibold">{String(b.booked_date)} {String(b.start_time).slice(0, 5)}〜{String(b.end_time).slice(0, 5)}</p>
                  <p className="text-xs text-(--color-dim)">{bayName(b)}{b.party_size && Number(b.party_size) > 1 ? ` ・ ${String(b.party_size)}名` : ""}</p>
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
                <span>{String(b.booked_date)} {String(b.start_time).slice(0, 5)} ・ {bayName(b)}</span>
                <span className="text-xs text-(--color-dim)">{BOOKING_STATUS_LABEL[String(b.status)] ?? String(b.status)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
