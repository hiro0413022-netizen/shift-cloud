import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { genSlots } from "@/lib/reservation";
import { bookPublic } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

const field =
  "w-full rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-base text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-sky-500 focus:outline-none";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF 姫路</p>
        <h1 className="text-2xl font-bold tracking-wide">Web予約</h1>
      </div>
      {children}
    </main>
  );
}

export default async function BookPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ date?: string; booked?: string; err?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const admin = createAdmin();

  const { data: tok } = await admin
    .from("res_tokens").select("company_id, store_id, active, stores(name, open_time, close_time)")
    .eq("token_hash", hashToken(token)).maybeSingle();

  if (!tok || !tok.active) {
    return <Shell><div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-6 text-center"><p className="text-lg font-semibold">予約URLが無効です</p><p className="mt-2 text-sm text-(--color-dim)">お手数ですが店舗にお問い合わせください。</p></div></Shell>;
  }

  if (sp.booked === "1") {
    return <Shell><div className="rounded-xl border border-emerald-500/40 bg-(--color-panel) p-8 text-center"><p className="text-3xl">✓</p><p className="mt-3 text-lg font-semibold">ご予約を受け付けました</p><p className="mt-2 text-sm text-(--color-dim)">当日お気をつけてお越しください。変更・キャンセルは店舗までご連絡ください。</p><a href={`/book/${token}`} className="mt-4 inline-block text-sm text-sky-300">続けて予約する</a></div></Shell>;
  }

  const storeRaw = tok.stores as unknown;
  const store = (Array.isArray(storeRaw) ? storeRaw[0] ?? {} : storeRaw ?? {}) as Row;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : new Date().toISOString().slice(0, 10);
  const slots = genSlots(store.open_time as string | null, store.close_time as string | null);

  const [{ data: resources }, { data: bookings }] = await Promise.all([
    admin.from("res_resources").select("id, name, kind").eq("store_id", tok.store_id as string).eq("active", true).is("deleted_at", null).order("sort_order"),
    admin.from("res_bookings").select("resource_id, start_time, status").eq("store_id", tok.store_id as string).is("deleted_at", null).eq("booking_date", date),
  ]);
  const resList = (resources ?? []) as Row[];
  const taken = new Set((bookings ?? []).filter((b) => (b as Row).status !== "canceled").map((b) => `${(b as Row).resource_id}|${String((b as Row).start_time).slice(0, 5)}`));

  // 利用可能な (リソース, 時刻) を組み立て
  const available: { resId: string; resName: string; slot: string }[] = [];
  for (const s of slots) {
    for (const r of resList) {
      if (!taken.has(`${r.id}|${s}`)) available.push({ resId: String(r.id), resName: String(r.name), slot: s });
    }
  }

  return (
    <Shell>
      {/* 日付選択 */}
      <form className="mb-4 flex items-center justify-center gap-2">
        <input type="hidden" name="" />
        <input type="date" name="date" defaultValue={date} className={field} />
        <button className="rounded-xl bg-(--color-panel-2) px-4 py-3 text-sm">表示</button>
      </form>

      {sp.err && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300">{sp.err}</p>}

      {available.length === 0 ? (
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-6 text-center text-sm text-(--color-dim)">
          {date} は空き枠がありません。別の日付をお選びください。
        </div>
      ) : (
        <form action={bookPublic} className="space-y-5 pb-10">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="date" value={date} />

          <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-5">
            <p className="mb-3 text-sm font-semibold">ご希望の時間枠を選択（{date}）</p>
            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {available.map((a) => (
                <label key={`${a.resId}|${a.slot}`} className="flex items-center gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm">
                  <input type="radio" name="slot" value={`${a.resId}|${a.slot}`} required className="h-4 w-4" />
                  <span className="font-semibold text-sky-300">{a.slot}</span>
                  <span className="text-(--color-dim)">{a.resName}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-5 space-y-4">
            <p className="text-sm font-semibold">お客様情報</p>
            <input name="guest_name" required placeholder="お名前 *" className={field} />
            <input name="guest_phone" type="tel" placeholder="電話番号" className={field} />
            <input name="guest_email" type="email" placeholder="メールアドレス" className={field} />
            <input name="member_no" placeholder="会員番号（会員の方のみ）" className={field} />
            <div>
              <label className="mb-1 block text-sm text-(--color-dim)">人数</label>
              <input name="party_size" inputMode="numeric" defaultValue="1" className={field} />
            </div>
          </div>

          <button className="w-full rounded-xl bg-sky-600 py-4 text-lg font-semibold text-white transition-all hover:bg-sky-500">この内容で予約する</button>
        </form>
      )}
    </Shell>
  );
}
