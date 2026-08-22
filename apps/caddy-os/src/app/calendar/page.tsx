import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { currentYm, getMasters, getMonthBoard, getMonthCounts } from "@/lib/caddy";
import { MonthNav } from "@/components/month-nav";
import { CalendarBoard } from "./board";

export const dynamic = "force-dynamic";

/**
 * シフトカレンダー（小川さん依頼 / DECISIONS #140）
 *
 * 1画面で「誰が・いつ・どのゴルフ場に・確定かどうか」が見える。
 * ここで［確定］を押すと、それがそのまま派遣台帳・キャディ台帳・ゴルフ場提出CSV・
 * 請求・財務の元データになる（cad_dispatches 1本 ＝ 二度入力しない）。
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();

  const [board, masters, monthCounts] = await Promise.all([
    getMonthBoard(actor.companyId, ym),
    getMasters(actor.companyId),
    getMonthCounts(actor.companyId),
  ]);

  return (
    <main className="mx-auto max-w-[1400px] p-4 md:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-bold tracking-widest">シフトカレンダー</h1>
          <p className="mt-1 text-sm text-(--color-dim)">
            日付をタップ → キャディとゴルフ場を選ぶ → ［確定］。確定した内容が台帳・提出CSV・請求へ自動で流れます。
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="month"
            name="ym"
            defaultValue={ym}
            className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm">表示</button>
        </form>
      </header>

      <MonthNav base="/calendar" ym={ym} counts={monthCounts} />

      <section className={cardCls}>
        <CalendarBoard
          ym={ym}
          days={board.days}
          dispatches={board.dispatches}
          availability={board.availability}
          clients={masters.clients.map((c) => ({ id: c.id, name: c.name }))}
          partners={masters.partners.map((p) => ({ id: p.id, name: p.name }))}
          staff={masters.staff}
        />
      </section>

      <p className="mt-4 text-xs text-(--color-dim)">
        ※ <b>仮</b>は下書きです。売上・外注費・請求・ゴルフ場提出CSVには入りません。<b>確定</b>を押した瞬間に反映されます。
        取消した派遣は履歴として残り、集計からは外れます。
      </p>
    </main>
  );
}
