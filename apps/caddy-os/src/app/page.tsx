import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { getDispatches, getTrend, summarize, byClient, byPartner, currentYm, yen } from "@/lib/caddy";
import { refreshFinanceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();

  const [rows, trend] = await Promise.all([getDispatches(actor.companyId, ym), getTrend(actor.companyId, 6)]);
  const s = summarize(rows, ym);
  const clients = byClient(rows);
  const partners = byPartner(rows);
  const staffCount = rows.filter((r) => r.staff_id).length;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN</p>
          <h1 className="text-2xl font-bold tracking-widest">Caddy OS</h1>
          <p className="mt-1 text-sm text-(--color-dim)">キャディ派遣 — 派遣台帳・売上・委託料・収支</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dispatches" className="text-sm underline">
            派遣台帳
          </Link>
          <Link href="/invoices" className="text-sm underline">
            請求（受取）
          </Link>
          <Link href="/invoices/payable" className="text-sm underline">
            支払
          </Link>
          <Link href="/availability" className="text-sm underline">
            出勤可否
          </Link>
          <Link href="/masters" className="text-sm underline">
            設定
          </Link>
          <form action="/api/logout" method="post">
            <button className="text-sm text-(--color-dim) hover:text-(--color-txt)">
              {actor.name} — ログアウト
            </button>
          </form>
        </div>
      </header>

      <form method="get" className="mb-4 flex items-center gap-2">
        <input
          type="month"
          name="ym"
          defaultValue={ym}
          className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
        />
        <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm">表示</button>
      </form>

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="売上（税抜）" value={yen(s.sales)} sub={`人工 ${s.dispatches}`} />
        <Kpi label="外注費" value={yen(s.outsourcing)} sub={`委託先 ${partners.length}名`} />
        <Kpi label="粗利" value={yen(s.gross)} sub={`${s.grossRate.toFixed(1)}%`} tone={s.gross >= 0 ? "good" : "bad"} />
        <Kpi label="自社スタッフ稼働" value={`${staffCount} 回`} sub="人件費は給与側で計上" />
      </section>

      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <b>粗利の見方</b>: ここでの粗利は「売上 − 外注費」です。自社スタッフ（林さん）の人件費は
        <b>給与システム側で計上</b>されるため含みません。事業の最終利益は Genesis の事業別PLで見てください
        （粗利 − 自社人件費）。<b>月商が約80万円を下回ると赤字圏</b>に入ります。
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <div className={cardCls}>
          <h2 className="mb-3 font-semibold">取引先別（請求のもと）</h2>
          {clients.length === 0 ? (
            <p className="text-sm text-(--color-dim)">この月の派遣はまだありません</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-(--color-dim)">
                <tr>
                  <th className="pb-2">ゴルフ場</th>
                  <th className="pb-2 text-right">人工</th>
                  <th className="pb-2 text-right">売上</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.name} className="border-t border-(--color-line)">
                    <td className="py-1.5">{c.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.count}</td>
                    <td className="py-1.5 text-right tabular-nums">{yen(c.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={cardCls}>
          <h2 className="mb-3 font-semibold">委託先別（支払のもと）</h2>
          {partners.length === 0 ? (
            <p className="text-sm text-(--color-dim)">この月の委託はまだありません</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-(--color-dim)">
                <tr>
                  <th className="pb-2">委託先</th>
                  <th className="pb-2 text-right">件数</th>
                  <th className="pb-2 text-right">委託料</th>
                  <th className="pb-2 text-right">交通費</th>
                  <th className="pb-2 text-right">支払計</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.name} className="border-t border-(--color-line)">
                    <td className="py-1.5">{p.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.count}</td>
                    <td className="py-1.5 text-right tabular-nums">{yen(p.fee)}</td>
                    <td className="py-1.5 text-right tabular-nums">{yen(p.transport)}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{yen(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className={cardCls}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">推移（直近6ヶ月）</h2>
          <form action={refreshFinanceAction}>
            <input type="hidden" name="ym" value={ym} />
            <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs">財務へ再集計</button>
          </form>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-(--color-dim)">
            <tr>
              <th className="pb-2">月</th>
              <th className="pb-2 text-right">人工</th>
              <th className="pb-2 text-right">売上</th>
              <th className="pb-2 text-right">外注費</th>
              <th className="pb-2 text-right">粗利</th>
              <th className="pb-2 text-right">粗利率</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((t) => (
              <tr key={t.month} className="border-t border-(--color-line)">
                <td className="py-1.5">{t.month}</td>
                <td className="py-1.5 text-right tabular-nums">{t.count}</td>
                <td className="py-1.5 text-right tabular-nums">{yen(t.sales)}</td>
                <td className="py-1.5 text-right tabular-nums">{yen(t.cost)}</td>
                <td className="py-1.5 text-right tabular-nums">{yen(t.gross)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {t.sales > 0 ? `${((t.gross / t.sales) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "";
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
      <p className="text-xs text-(--color-dim)">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-(--color-dim)">{sub}</p> : null}
    </div>
  );
}
