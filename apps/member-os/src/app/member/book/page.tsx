import Link from "next/link";
import { requireMember, resolveHimeji } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { genSlots } from "@/lib/reservation";
import { bookAsMember } from "../actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

const field =
  "w-full rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-base text-(--color-txt) focus:border-sky-500 focus:outline-none";

export default async function MemberBookPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; err?: string }>;
}) {
  await requireMember();
  const store = await resolveHimeji();
  const admin = createAdmin();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : new Date().toISOString().slice(0, 10);

  const slots = genSlots(store?.openTime ?? null, store?.closeTime ?? null);
  const [{ data: resources }, { data: bookings }] = await Promise.all([
    admin.from("res_resources").select("id, name").eq("store_id", store?.storeId ?? "").eq("active", true).is("deleted_at", null).order("sort_order"),
    admin.from("res_bookings").select("resource_id, start_time, status").eq("store_id", store?.storeId ?? "").is("deleted_at", null).eq("booking_date", date),
  ]);
  const resList = (resources ?? []) as Row[];
  const taken = new Set((bookings ?? []).filter((b) => (b as Row).status !== "canceled").map((b) => `${(b as Row).resource_id}|${String((b as Row).start_time).slice(0, 5)}`));

  const available: { resId: string; resName: string; slot: string }[] = [];
  for (const s of slots) {
    for (const r of resList) {
      if (!taken.has(`${r.id}|${s}`)) available.push({ resId: String(r.id), resName: String(r.name), slot: s });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-wide">Web予約</h1>
        <Link href="/member" className="text-sm text-(--color-dim) hover:text-(--color-txt)">← マイページ</Link>
      </header>

      <form className="mb-4 flex items-center gap-2">
        <input type="date" name="date" defaultValue={date} className={field} />
        <button className="rounded-xl bg-(--color-panel-2) px-4 py-3 text-sm">表示</button>
      </form>

      {sp.err && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300">{sp.err}</p>}

      {available.length === 0 ? (
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-6 text-center text-sm text-(--color-dim)">
          {date} は空き枠がありません。別の日付をお選びください。
        </div>
      ) : (
        <form action={bookAsMember} className="space-y-5 pb-10">
          <input type="hidden" name="date" value={date} />
          <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-5">
            <p className="mb-3 text-sm font-semibold">ご希望の時間枠（{date}）</p>
            <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {available.map((a) => (
                <label key={`${a.resId}|${a.slot}`} className="flex items-center gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm">
                  <input type="radio" name="slot" value={`${a.resId}|${a.slot}`} required className="h-4 w-4" />
                  <span className="font-semibold text-sky-300">{a.slot}</span>
                  <span className="text-(--color-dim)">{a.resName}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-5">
            <label className="mb-1 block text-sm text-(--color-dim)">人数</label>
            <input name="party_size" inputMode="numeric" defaultValue="1" className={field} />
          </div>
          <button className="w-full rounded-xl bg-sky-600 py-4 text-lg font-semibold text-white transition-all hover:bg-sky-500">この内容で予約する</button>
        </form>
      )}
    </main>
  );
}
