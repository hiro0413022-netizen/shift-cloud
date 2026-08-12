import { notFound } from "next/navigation";
import { loadDay, occupancy, lessonOccupancy, type BookingRow } from "@/lib/frank-reservation";
import { toMin, outstanding, CUSTOMER_KIND_LABEL } from "@yozan/core/frank-booking";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { BoardAutoRefresh } from "./refresh";

export const dynamic = "force-dynamic";

/**
 * 店頭カレンダー（ロビー掲示・常設タブレット）
 * 台帳は frunk_bookings 一本（#93）。会員・体験・都度・レッスン枠がこの1画面に出る。
 *
 * 店舗アカウントでログインして開く（middleware の認可対象・publicPrefixes には入れないこと）。
 * 以前あったトークンURL `/board/<token>` は廃止した。
 *
 * ★ 店舗またぎ廃止（#134）: ログインしたアカウントがFRANK姫路に配属されていなければ見せない。
 *   ロビー掲示なのでレイアウトは (main) の外だが、認可はここで自分で行う必要がある。
 */

function jstNow(): { date: string; hhmm: string } {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { date: d.toISOString().slice(0, 10), hhmm };
}

/** 掲示なので個人が特定されすぎないよう、名字だけ・最大6文字 */
function shortName(b: BookingRow): string {
  const n = b.frunk_members?.name ?? b.mbr_trial_requests?.name ?? b.guest_name ?? "ご予約";
  const head = n.split(/[\s　]/)[0] || n;
  return head.length > 6 ? head.slice(0, 6) : head;
}

export default async function BoardPage() {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) notFound();
  const jst = jstNow();
  const view = await loadDay(jst.date, actor.companyId);
  const bays = view.bays.filter((b) => b.active);
  const cells = occupancy(view);
  const lessonCells = lessonOccupancy(view);
  const nowMin = toMin(jst.hhmm);
  const step = view.cfg.slot_minutes;

  return (
    <main className="min-h-screen bg-black px-4 py-4 text-white">
      <header className="mb-3 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-xs tracking-[0.4em] text-amber-400">FRANK GOLF</span>
          <h1 className="text-2xl font-bold">本日のご予約</h1>
        </div>
        <div className="flex items-baseline gap-3 text-neutral-400">
          <span className="text-sm">{jst.date}</span>
          <span className="text-3xl font-bold text-white"><BoardAutoRefresh /></span>
        </div>
      </header>

      {view.closed ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-3xl font-bold text-neutral-500">本日は定休日です</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-black p-2 text-left text-sm text-neutral-500">打席 / 時間</th>
                {view.slots.map((s) => {
                  const isNow = toMin(s) <= nowMin && nowMin < toMin(s) + step;
                  return (
                    <th key={s} className={`p-2 text-sm font-semibold ${isNow ? "text-amber-400" : "text-neutral-400"}`}>{s}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {bays.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="sticky left-0 z-10 bg-black p-2 text-left font-bold whitespace-nowrap">{r.name}</td>
                  {view.slots.map((s) => {
                    const b = cells.get(`${r.id}|${s}`);
                    const l = lessonCells.get(`${r.id}|${s}`);
                    const isNow = toMin(s) <= nowMin && nowMin < toMin(s) + step;
                    if (!b && !l) {
                      return <td key={s} className={`p-2 text-lg ${isNow ? "bg-neutral-900" : ""} text-neutral-700`}>―</td>;
                    }
                    if (!b && l) {
                      return (
                        <td key={s} className={`p-1.5 ${isNow ? "ring-2 ring-amber-400/60" : ""}`}>
                          <div className="rounded-md bg-violet-600 px-1 py-2 text-base leading-tight font-bold text-white">レッスン</div>
                        </td>
                      );
                    }
                    const bk = b as BookingRow;
                    const tone =
                      bk.customer_kind === "trial" ? "bg-amber-500 text-black"
                      : bk.customer_kind === "member" ? "bg-sky-600 text-white"
                      : "bg-emerald-600 text-white";
                    return (
                      <td key={s} className={`p-1.5 ${isNow ? "ring-2 ring-amber-400/60" : ""}`}>
                        <div className={`rounded-md px-1 py-2 text-base leading-tight font-bold ${tone}`}>
                          {shortName(bk)}
                          {bk.party_size && bk.party_size > 1 ? <span className="ml-1 text-xs opacity-80">{bk.party_size}名</span> : null}
                          {outstanding(bk.amount, bk.paid_amount, bk.payment_status) > 0
                            ? <span className="ml-1 rounded bg-amber-400 px-1 align-middle text-[10px] font-bold text-black">未収</span> : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="mt-4 flex items-center gap-4 text-sm text-neutral-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-sky-600" />{CUSTOMER_KIND_LABEL.member}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-amber-500" />{CUSTOMER_KIND_LABEL.trial}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-emerald-600" />{CUSTOMER_KIND_LABEL.dropin}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-violet-600" />レッスン</span>
        <span className="ml-auto">60秒ごとに自動更新</span>
      </footer>
    </main>
  );
}
