import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { genSlots, toMin, outstanding } from "@/lib/reservation";
import { BoardAutoRefresh } from "./refresh";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

function jstNow(): { date: string; hhmm: string } {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9 = JST
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { date: d.toISOString().slice(0, 10), hhmm };
}

export default async function BoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdmin();

  const { data: tok } = await admin
    .from("res_tokens")
    .select("store_id, active, purpose, stores(name, open_time, close_time)")
    .eq("token_hash", hashToken(token)).maybeSingle();

  if (!tok || !tok.active || tok.purpose !== "board") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-center">
        <div>
          <p className="text-2xl font-semibold text-white">表示URLが無効です</p>
          <p className="mt-2 text-sm text-neutral-400">スタッフにお問い合わせください。</p>
        </div>
      </main>
    );
  }

  const storeRaw = tok.stores as unknown;
  const store = (Array.isArray(storeRaw) ? storeRaw[0] ?? {} : storeRaw ?? {}) as Row;
  const jst = jstNow();
  const date = jst.date;
  const slots = genSlots(store.open_time as string | null, store.close_time as string | null);

  const [{ data: resources }, { data: bookings }] = await Promise.all([
    admin.from("res_resources").select("id, name, kind").eq("store_id", tok.store_id as string).eq("active", true).is("deleted_at", null).order("sort_order"),
    admin.from("res_bookings").select("resource_id, start_time, status, customer_kind, guest_name, member_no, party_size, payment_status, amount, paid_amount").eq("store_id", tok.store_id as string).is("deleted_at", null).eq("booking_date", date),
  ]);
  const resList = (resources ?? []) as Row[];
  const byCell = new Map<string, Row>();
  for (const b of (bookings ?? []) as Row[]) {
    if (b.status !== "canceled") byCell.set(`${b.resource_id}|${String(b.start_time).slice(0, 5)}`, b);
  }

  const nowMin = toMin(jst.hhmm);
  const label = (b: Row): string => {
    const n = b.guest_name ? String(b.guest_name) : b.member_no ? String(b.member_no) : "予約";
    return n.length > 6 ? n.slice(0, 6) : n;
  };

  return (
    <main className="min-h-screen bg-black px-4 py-4 text-white">
      <header className="mb-3 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-xs tracking-[0.4em] text-amber-400">FRUNK GOLF</span>
          <h1 className="text-2xl font-bold">{String(store.name ?? "姫路")} 本日のご予約</h1>
        </div>
        <div className="flex items-baseline gap-3 text-neutral-400">
          <span className="text-sm">{date}</span>
          <span className="text-3xl font-bold text-white"><BoardAutoRefresh /></span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-black p-2 text-left text-sm text-neutral-500">打席 / 時間</th>
              {slots.map((s) => {
                const isNow = toMin(s) <= nowMin && nowMin < toMin(s) + 60;
                return (
                  <th key={s} className={`p-2 text-sm font-semibold ${isNow ? "text-amber-400" : "text-neutral-400"}`}>{s}</th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {resList.map((r) => (
              <tr key={String(r.id)} className="border-t border-neutral-800">
                <td className="sticky left-0 z-10 bg-black p-2 text-left font-bold whitespace-nowrap">{String(r.name)}</td>
                {slots.map((s) => {
                  const b = byCell.get(`${r.id}|${s}`);
                  const isNow = toMin(s) <= nowMin && nowMin < toMin(s) + 60;
                  if (!b) {
                    return <td key={s} className={`p-2 text-lg ${isNow ? "bg-neutral-900" : ""} text-neutral-700`}>―</td>;
                  }
                  const member = String(b.customer_kind) === "member";
                  return (
                    <td key={s} className={`p-1.5 ${isNow ? "ring-2 ring-amber-400/60" : ""}`}>
                      <div className={`rounded-md px-1 py-2 text-base font-bold leading-tight ${member ? "bg-sky-600 text-white" : "bg-emerald-600 text-white"}`}>
                        {label(b)}
                        {b.party_size && Number(b.party_size) > 1 ? <span className="ml-1 text-xs opacity-80">{String(b.party_size)}名</span> : null}
                        {outstanding(b.amount as number | null, b.paid_amount as number | null, String(b.payment_status ?? "unpaid")) > 0
                          ? <span className="ml-1 rounded bg-amber-400 px-1 text-[10px] font-bold text-black align-middle">未収</span> : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-4 flex items-center gap-4 text-sm text-neutral-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-sky-600" />会員</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-emerald-600" />都度利用</span>
        <span className="ml-auto">60秒ごとに自動更新</span>
      </footer>
    </main>
  );
}
