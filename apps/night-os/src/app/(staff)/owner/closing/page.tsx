import Link from "next/link";
import { Avatar, Yen } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { businessDate, castMonthLines, getActiveRules, monthRange, resolveNightStore } from "@/lib/night";
import { confirmClosing } from "./actions";

export const dynamic = "force-dynamic";

const STEPS = [
  { key: "draft", label: "集計" },
  { key: "reviewing", label: "確認" },
  { key: "confirmed", label: "確定" },
  { key: "sent", label: "明細送付" },
] as const;

export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const store = await resolveNightStore();
  if (!store) return <main className="p-6 text-sm text-(--color-dim)">店舗が登録されていません。</main>;

  const today = businessDate();
  const month = m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : `${today.slice(0, 7)}-01`;
  const { from } = monthRange(month);
  const { rules } = await getActiveRules(store.id);
  const lines = await castMonthLines(store.id, month, rules);

  const admin = createAdmin();
  const { data: closing } = await admin
    .from("nite_closings")
    .select("status, confirmed_at, totals")
    .eq("store_id", store.id)
    .eq("target_month", from)
    .maybeSingle();
  const status = (closing?.status as string) ?? "reviewing";
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.key === status));

  const gross = lines.reduce((s, l) => s + l.line.gross, 0);
  const advance = lines.reduce((s, l) => s + l.line.advanceTotal, 0);
  const net = lines.reduce((s, l) => s + l.line.net, 0);
  const review = lines.filter((l) => l.line.needsReview);

  const prev = new Date(`${from}T00:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/owner" className="text-sm text-(--color-dim)">
          ←
        </Link>
        <h1 className="mn text-lg font-bold">{Number(from.slice(5, 7))}月分の締め</h1>
        <div className="grow" />
        <Link href={`/owner/closing?m=${prev.toISOString().slice(0, 7)}`} className="min-h-11 px-2 leading-[44px] text-sm text-(--color-dim)">
          ‹
        </Link>
        <Link href={`/owner/closing?m=${next.toISOString().slice(0, 7)}`} className="min-h-11 px-2 leading-[44px] text-sm text-(--color-dim)">
          ›
        </Link>
      </div>

      <div className="mb-4 flex items-center">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-1 items-center">
            <div className="flex w-16 flex-col items-center gap-1">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  i < stepIndex
                    ? "bg-(--color-ok) text-white"
                    : i === stepIndex
                      ? "bg-(--color-accent) text-white"
                      : "bg-(--color-panel-2) text-(--color-mute)"
                }`}
              >
                {i + 1}
              </span>
              <span className={`text-[9px] ${i <= stepIndex ? "font-bold" : "text-(--color-mute)"}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`mb-4 h-0.5 grow ${i < stepIndex ? "bg-(--color-ok)" : "bg-(--color-line)"}`} />
            )}
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-(--color-line) bg-white p-4">
        <div className="text-xs text-(--color-dim)">
          支給総額（{from} 〜 {monthRange(month).to}）
        </div>
        <div className="mn text-[34px] font-bold leading-none">
          <Yen value={gross} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-(--color-bg) px-2.5 py-2">
            <div className="text-[10px] text-(--color-dim)">対象</div>
            <div className="text-[15px] font-bold">{lines.length}名</div>
          </div>
          <div className="rounded-lg bg-(--color-bg) px-2.5 py-2">
            <div className="text-[10px] text-(--color-dim)">日払い済</div>
            <div className="text-[15px] font-bold">
              <Yen value={advance} />
            </div>
          </div>
          <div className="rounded-lg bg-(--color-bg) px-2.5 py-2">
            <div className="text-[10px] text-(--color-dim)">差引支給</div>
            <div className="text-[15px] font-bold">
              <Yen value={net} />
            </div>
          </div>
        </div>
      </section>

      {review.length > 0 && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-(--color-accent-soft) bg-white p-3">
          <span className="grow text-[11px] leading-relaxed text-(--color-accent-2)">
            要確認 <b>{review.length}名</b> ・ {review.map((r) => r.cast.name).join("、")} の日払いが支給額を超えています
          </span>
        </div>
      )}

      <section className="mt-3 rounded-xl border border-(--color-line) bg-white p-4">
        <div className="mb-1 flex items-center">
          <span className="text-xs font-bold">キャスト別</span>
          <div className="grow" />
          <span className="text-[10px] text-(--color-dim)">出勤日数 ・ 差引支給額</span>
        </div>
        {lines.length === 0 && <p className="text-[11px] text-(--color-mute)">この月の記録はまだありません。</p>}
        <div className="flex flex-col">
          {lines.map((l, i) => (
            <div
              key={l.cast.id}
              className={`flex items-center gap-2.5 border-b border-(--color-panel-2) py-2.5 last:border-b-0 ${
                l.line.needsReview ? "bg-(--color-warn-soft)" : ""
              }`}
            >
              <Avatar name={l.cast.displayName} tone={i} />
              <div className="grow">
                <div className="text-xs font-medium">
                  {l.cast.name}
                  {l.line.needsReview && <span className="ml-1 text-[10px] font-bold text-(--color-accent)">要確認</span>}
                </div>
                <div className="mt-0.5 text-[10px] text-(--color-dim)">
                  {l.line.workDays}日 ・ 時給 <Yen value={l.line.hourlyTotal} /> ＋ バック <Yen value={l.line.backTotal} />
                  {l.line.allowanceTotal > 0 && (
                    <>
                      {" "}
                      ＋ 手当 <Yen value={l.line.allowanceTotal} />
                    </>
                  )}
                </div>
              </div>
              <div className={`text-[15px] font-bold ${l.line.net < 0 ? "text-(--color-accent)" : ""}`}>
                <Yen value={l.line.net} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-3 px-0.5 text-[10px] leading-relaxed text-(--color-mute)">
        確定すると金額はロックされます。あとで直す場合は「訂正」として履歴が残ります。
        {closing?.confirmed_at && ` 確定日時: ${new Date(closing.confirmed_at as string).toLocaleString("ja-JP")}`}
      </p>

      <form action={confirmClosing} className="mt-3 flex gap-2">
        <input type="hidden" name="month" value={from} />
        <a
          href={`/api/closing-csv?m=${from.slice(0, 7)}`}
          className="flex min-h-12 w-24 flex-col items-center justify-center rounded-lg border border-(--color-line) text-xs"
        >
          <span className="font-medium">CSV出力</span>
          <span className="text-[9px] text-(--color-dim)">税理士用</span>
        </a>
        <button className="min-h-12 grow rounded-lg bg-(--color-accent) text-sm font-bold text-white" disabled={lines.length === 0}>
          {status === "confirmed" ? "この内容で確定し直す" : "確定して明細を送る"}
        </button>
      </form>
    </main>
  );
}
