import Link from "next/link";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel } from "@/components/ui";
import { StatCard, type StatGroup } from "./stat-card";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end), prev: ym(new Date(y, m - 2, 1)), next: ym(new Date(y, m, 1)), label: `${y}年${m}月` };
}
function md(d: unknown): string {
  const s = String(d ?? "");
  const m = s.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : s;
}
function rate(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : ym(new Date());
  const { start, end, prev, next, label } = monthBounds(month);

  const [{ data: visits }, { data: joins }, { data: leaves }] = await Promise.all([
    admin
      .from("mbr_walkin_visits")
      .select("visit_type, result, repeat_date, discount, referral_source, visited_on, mbr_guests(name)")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .gte("visited_on", start)
      .lt("visited_on", end)
      .order("visited_on", { ascending: true }),
    admin
      .from("mbr_members")
      .select("name, member_type, join_date")
      .eq("company_id", actor.companyId)
      .gte("join_date", start)
      .lt("join_date", end)
      .order("join_date", { ascending: true }),
    admin
      .from("mbr_members")
      .select("name, member_type, leave_date")
      .eq("company_id", actor.companyId)
      .gte("leave_date", start)
      .lt("leave_date", end)
      .order("leave_date", { ascending: true }),
  ]);

  const vs = (visits ?? []) as Row[];
  const nameOf = (v: Row) => {
    const g = v.mbr_guests as { name?: string } | null;
    return g?.name ? String(g.name) : "（氏名未入力）";
  };
  const isRepeat = (v: Row) =>
    v.repeat_date != null || String(v.discount ?? "") === "再来" || String(v.referral_source ?? "") === "再来";

  const trials = vs.filter((v) => v.visit_type === "trial");
  const trialJoins = trials.filter((v) => v.result === "join");
  const fittings = vs.filter((v) => v.visit_type === "fitting");
  const fittingBuys = fittings.filter((v) => v.result === "purchase");
  const fittingRepeats = fittings.filter(isRepeat);

  const joinList = (joins ?? []) as Row[];
  const leaveList = (leaves ?? []) as Row[];

  // ---- カード用グループ ----
  const trialGroups: StatGroup[] = [
    {
      key: "trial",
      label: "体験者",
      tone: "indigo",
      count: trials.length,
      items: trials.map((v) => ({
        name: nameOf(v),
        sub: `${md(v.visited_on)}${v.result === "join" ? "・入会" : ""}`,
      })),
    },
  ];
  const joinGroups: StatGroup[] = [
    {
      key: "join",
      label: "入会者",
      tone: "emerald",
      count: joinList.length,
      items: joinList.map((m) => ({ name: String(m.name), sub: String(m.member_type ?? "—") })),
    },
  ];
  const leaveGroups: StatGroup[] = [
    {
      key: "leave",
      label: "退会者",
      tone: "rose",
      count: leaveList.length,
      items: leaveList.map((m) => ({ name: String(m.name), sub: String(m.member_type ?? "—") })),
    },
  ];
  const fittingGroups: StatGroup[] = [
    {
      key: "buy",
      label: "購入者",
      tone: "emerald",
      count: fittingBuys.length,
      items: fittingBuys.map((v) => ({ name: nameOf(v), sub: md(v.visited_on) })),
    },
    {
      key: "repeat",
      label: "再来者",
      tone: "amber",
      count: fittingRepeats.length,
      items: fittingRepeats.map((v) => ({ name: nameOf(v), sub: md(v.visited_on) })),
    },
  ];

  const net = joinList.length - leaveList.length;

  return (
    <div className="space-y-5">
      <header className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">店舗ダッシュボード</h1>
          <p className="mt-0.5 text-sm text-[--color-dim]">GOLF WING 宝塚 ・ 月次サマリー</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard?month=${prev}`} className="rounded-lg border border-[--color-line] bg-white px-2.5 py-1.5 text-sm text-[--color-dim] hover:text-[--color-txt]" aria-label="前月">←</Link>
          <form>
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-[--color-line] bg-white px-3 py-1.5 text-sm font-medium text-[--color-txt] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
            />
          </form>
          <Link href={`/dashboard?month=${next}`} className="rounded-lg border border-[--color-line] bg-white px-2.5 py-1.5 text-sm text-[--color-dim] hover:text-[--color-txt]" aria-label="翌月">→</Link>
        </div>
      </header>

      <p className="reveal text-sm font-semibold text-[--color-txt]">{label} の実績</p>

      {/* 主要4指標（ボタンで内訳展開） */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="体験数" value={trials.length} tone="indigo" hint={`体験→入会率 ${rate(trialJoins.length, trials.length)}`} groups={trialGroups} />
        <StatCard label="入会者数" value={joinList.length} tone="emerald" hint="今月入会（会員名簿より）" groups={joinGroups} />
        <StatCard label="退会者数" value={leaveList.length} tone="rose" hint="今月退会（会員名簿の退会日より）" groups={leaveGroups} />
        <StatCard label="フィッティング件数" value={fittings.length} tone="amber" hint={`購入率 ${rate(fittingBuys.length, fittings.length)}`} groups={fittingGroups} />
      </div>

      {/* 補助指標 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat label="体験→入会率" value={rate(trialJoins.length, trials.length)} sub={`${trialJoins.length} / ${trials.length} 名`} tone="text-indigo-600" />
        <MiniStat label="フィッティング→購入率" value={rate(fittingBuys.length, fittings.length)} sub={`${fittingBuys.length} / ${fittings.length} 名`} tone="text-amber-600" />
        <MiniStat label="会員 純増" value={`${net >= 0 ? "+" : ""}${net}`} sub={`入会 ${joinList.length} ・ 退会 ${leaveList.length}`} tone={net >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>

      <Panel title="この画面について" className="d2">
        <ul className="space-y-1.5 text-sm text-[--color-dim]">
          <li>・各指標の色付きボタンを押すと、名前・プランなどの内訳が展開します。</li>
          <li>・<span className="text-[--color-txt]">入会者／退会者</span>は会員名簿（Smart Hello取込）から、当月の入会日／退会日で抽出。退会は「6月末退会＝6月」に集計されます。</li>
          <li>・<span className="text-[--color-txt]">体験／フィッティング</span>は一時利用者台帳から集計。再来者は「割引=再来 / 経路=再来 / 再来日あり」で判定。</li>
          <li>・右上の月セレクタ（←／→）で対象月を切り替えられます。</li>
        </ul>
      </Panel>
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="hud reveal rounded-2xl border border-[--color-line] bg-[--color-panel] p-5">
      <p className="text-sm font-medium text-[--color-dim]">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-[--color-dim]">{sub}</p>
    </div>
  );
}
