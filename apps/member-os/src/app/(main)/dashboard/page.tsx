import Link from "next/link";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel } from "@/components/ui";
import { StatCard, type StatGroup } from "./stat-card";
import { FrankCalendarDashboard } from "./frank-calendar";
import { STEP_OPTIONS } from "@/components/month-picker";
import { jstToday } from "@yozan/core/frank-booking";
import { FRANK_STORE_ID, canAccessFrank, golfWingStoreId, canAccessStore, companyHasFrank, storeFilterIds } from "@/lib/store-scope";
import { tallyJoins, type LedgerJoin, type RosterJoin } from "@/lib/join-tally-pure";
import { VISIT_TYPE_LABEL } from "@/lib/walkin";

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
  searchParams: Promise<{ month?: string; date?: string; view?: string; step?: string; store?: string; sel?: string }>;
}) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const sp = await searchParams;

  // 店舗分岐（#129 / #134）: FRANK姫路の店舗アカウントは予約カレンダーが最初の画面。
  // GOLF WING宝塚は従来の月次KPI。?store= の直打ちでは越境できない（見える店舗だけを選べる）。
  const gwStoreId = await golfWingStoreId(actor.companyId);
  const hasFrank = await companyHasFrank(actor.companyId);
  // #150: 会社がその店舗を持っているかを先に見る。旧実装はオーナー=無条件trueで、
  // 外販テナント（サンプルゴルフスタジオ等）のオーナーにFRANKカレンダーが出ていた
  const canFrank = hasFrank && canAccessFrank(actor);
  const canGw = gwStoreId != null && canAccessStore(actor, gwStoreId);
  const bothStores = canFrank && canGw;

  let showFrank: boolean;
  if (!canGw) showFrank = canFrank;            // FRANK専任（宝塚は見せない）
  else if (!canFrank) showFrank = false;       // GOLF WING専任（姫路は見せない）
  else if (sp.store === "gw") showFrank = false;
  else if (sp.store === "frank") showFrank = true;
  else showFrank = actor.isOwner || actor.primaryStoreId === FRANK_STORE_ID; // 既定（#129）

  if (!canFrank && !canGw) {
    // 会社に GOLF WING / FRANK が無い＝外販テナント。汎用ダッシュボードを出す（#150）
    if (!gwStoreId && !hasFrank) {
      return <GenericDashboard companyId={actor.companyId} scopeIds={storeFilterIds(actor)} />;
    }
    return (
      <Panel title="表示できる店舗がありません">
        <p className="text-sm text-(--color-dim)">
          配属店舗が設定されていないため、ダッシュボードに表示できるデータがありません。
          Shift Cloud の「スタッフ」画面で配属店舗を設定してください。
        </p>
      </Panel>
    );
  }

  if (showFrank) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : jstToday();
    // 月/週/日（#135）。既定は日。表示時刻の刻みは 15/30/60 分だけ許す（既定30分＝予約の刻みと同じ）
    const view = sp.view === "week" ? ("week" as const) : sp.view === "month" ? ("month" as const) : ("day" as const);
    const step = STEP_OPTIONS.includes(Number(sp.step)) ? Number(sp.step) : 30;
    return (
      <div className="space-y-4">
        {bothStores && (
          <p className="text-right text-xs">
            <Link href="/dashboard?store=gw" className="text-(--color-dim) underline hover:text-(--color-txt)">GOLF WING 宝塚の月次サマリーを見る →</Link>
          </p>
        )}
        <FrankCalendarDashboard
          date={date}
          view={view}
          step={step}
          companyId={actor.companyId}
          extraQuery={bothStores ? "&store=frank" : ""}
          sel={sp.sel ?? null}
        />
      </div>
    );
  }

  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : ym(new Date());
  const { start, end, prev, next, label } = monthBounds(month);
  const storeQ = bothStores ? "&store=gw" : "";

  // 見出しは「GOLF WING 宝塚」なので、姫路の来店が混ざらないよう店舗で必ず絞る（#134）
  let gwVisitsQ = admin
    .from("mbr_walkin_visits")
    .select("visit_type, result, repeat_date, discount, referral_source, visited_on, mbr_guests(name, name_kana, birth_date)")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .gte("visited_on", start)
    .lt("visited_on", end)
    .order("visited_on", { ascending: true });
  if (gwStoreId) gwVisitsQ = gwVisitsQ.eq("store_id", gwStoreId);

  const [{ data: visits }, { data: joins }, { data: leaves }] = await Promise.all([
    gwVisitsQ,
    // mbr_members（Smart Hello取込の会員名簿）はGOLF WING専用で店舗列を持たない（#134・来店検索と同じ扱い）
    admin
      .from("mbr_members")
      .select("name, name_kana, birth_date, member_type, join_date")
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
  type Guest = { name?: string | null; name_kana?: string | null; birth_date?: string | null };
  const guestOf = (v: Row) => (v.mbr_guests as Guest | null) ?? null;
  const nameOf = (v: Row) => {
    const g = guestOf(v);
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

  // 入会者は名簿（エクセル取込）が正。ただし取り込むまで 0 のままになるので、
  // 受付台帳の「成約=入会」を突き合わせて暫定値を出す（名簿に載ったら台帳側は自動で落ちる）
  const roster: RosterJoin[] = joinList.map((m) => ({
    name: m.name == null ? null : String(m.name),
    nameKana: m.name_kana == null ? null : String(m.name_kana),
    birthDate: m.birth_date == null ? null : String(m.birth_date),
    memberType: m.member_type == null ? null : String(m.member_type),
  }));
  const ledger: LedgerJoin[] = vs
    .filter((v) => v.result === "join")
    .map((v) => {
      const g = guestOf(v);
      return {
        name: g?.name == null ? null : String(g.name),
        nameKana: g?.name_kana == null ? null : String(g.name_kana),
        birthDate: g?.birth_date == null ? null : String(g.birth_date),
        visitedOn: v.visited_on == null ? null : String(v.visited_on),
        visitType: v.visit_type == null ? null : String(v.visit_type),
      };
    });
  const joinTally = tallyJoins(roster, ledger);

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
      label: "名簿",
      tone: "emerald",
      count: joinTally.roster.length,
      items: joinTally.roster.map((m) => ({ name: String(m.name ?? "（氏名未入力）"), sub: m.memberType ?? "—" })),
    },
    {
      key: "join_ledger",
      label: "受付台帳（暫定）",
      tone: "amber",
      count: joinTally.pending.length,
      items: joinTally.pending.map((m) => ({
        name: String(m.name ?? "（氏名未入力）"),
        sub: `${md(m.visitedOn)}${m.visitType ? `・${VISIT_TYPE_LABEL[m.visitType] ?? m.visitType}` : ""}`,
      })),
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

  const net = joinTally.total - leaveList.length;

  return (
    <div className="space-y-5">
      <header className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">店舗ダッシュボード</h1>
          <p className="mt-0.5 text-sm text-(--color-dim)">GOLF WING 宝塚 ・ 月次サマリー</p>
        </div>
        <div className="flex items-center gap-2">
          {bothStores && (
            <Link href="/dashboard?store=frank" className="mr-2 text-xs text-(--color-dim) underline hover:text-(--color-txt)">← FRANK姫路のカレンダー</Link>
          )}
          <Link href={`/dashboard?month=${prev}${storeQ}`} className="rounded-lg border border-(--color-line) bg-white px-2.5 py-1.5 text-sm text-(--color-dim) hover:text-(--color-txt)" aria-label="前月">←</Link>
          <form>
            {bothStores && <input type="hidden" name="store" value="gw" />}
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm font-medium text-(--color-txt) focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
            />
          </form>
          <Link href={`/dashboard?month=${next}${storeQ}`} className="rounded-lg border border-(--color-line) bg-white px-2.5 py-1.5 text-sm text-(--color-dim) hover:text-(--color-txt)" aria-label="翌月">→</Link>
        </div>
      </header>

      <p className="reveal text-sm font-semibold text-(--color-txt)">{label} の実績</p>

      {/* 主要4指標（ボタンで内訳展開） */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="体験数" value={trials.length} tone="indigo" hint={`体験→入会率 ${rate(trialJoins.length, trials.length)}`} groups={trialGroups} />
        <StatCard
          label="入会者数"
          value={joinTally.total}
          tone="emerald"
          hint={
            joinTally.provisional
              ? `暫定：名簿 ${joinTally.roster.length} ＋ 受付台帳 ${joinTally.pending.length}`
              : "今月入会（会員名簿より）"
          }
          groups={joinGroups}
        />
        <StatCard label="退会者数" value={leaveList.length} tone="rose" hint="今月退会（会員名簿の退会日より）" groups={leaveGroups} />
        <StatCard label="フィッティング件数" value={fittings.length} tone="amber" hint={`購入率 ${rate(fittingBuys.length, fittings.length)}`} groups={fittingGroups} />
      </div>

      {/* 補助指標 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat label="体験→入会率" value={rate(trialJoins.length, trials.length)} sub={`${trialJoins.length} / ${trials.length} 名`} tone="text-indigo-600" />
        <MiniStat label="フィッティング→購入率" value={rate(fittingBuys.length, fittings.length)} sub={`${fittingBuys.length} / ${fittings.length} 名`} tone="text-amber-600" />
        <MiniStat label="会員 純増" value={`${net >= 0 ? "+" : ""}${net}`} sub={`入会 ${joinTally.total} ・ 退会 ${leaveList.length}`} tone={net >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>

      <Panel title="この画面について" className="d2">
        <ul className="space-y-1.5 text-sm text-(--color-dim)">
          <li>・各指標の色付きボタンを押すと、名前・プランなどの内訳が展開します。</li>
          <li>・<span className="text-(--color-txt)">入会者</span>は会員名簿（Smart Hello取込）が正確な人数です。名簿を取り込むまでの間は、受付台帳の「成約＝入会」を足した<span className="text-(--color-txt)">暫定の人数</span>を表示します（氏名・カナで突き合わせるので、名簿を取り込めば二重に数えません）。</li>
          <li>・<span className="text-(--color-txt)">退会者</span>は会員名簿の退会日から抽出。退会は「6月末退会＝6月」に集計されます。</li>
          <li>・<span className="text-(--color-txt)">体験／フィッティング</span>は一時利用者台帳から集計。再来者は「割引=再来 / 経路=再来 / 再来日あり」で判定。</li>
          <li>・右上の月セレクタ（←／→）で対象月を切り替えられます。</li>
        </ul>
      </Panel>
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
      <p className="text-sm font-medium text-(--color-dim)">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-(--color-dim)">{sub}</p>
    </div>
  );
}


/**
 * 汎用ダッシュボード（#150・外販テナント向け）
 * GOLF WING / FRANK の店舗を持たない会社の最初の画面。
 * 受付台帳だけを源泉に、今月の体験・入会・入会率・要フォローを1画面で出す。
 */
async function GenericDashboard({ companyId, scopeIds }: { companyId: string; scopeIds: string[] | null }) {
  const admin = createAdmin();
  const now = new Date();
  const { start, end, label } = monthBounds(ym(now));
  const followDueBefore = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const since60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  let monthQ = admin
    .from("mbr_walkin_visits")
    .select("visit_type, result, visited_on, mbr_guests(name)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("visited_on", start)
    .lt("visited_on", end)
    .order("visited_on", { ascending: false });
  if (scopeIds) monthQ = monthQ.in("store_id", scopeIds);

  let followQ = admin
    .from("mbr_walkin_visits")
    .select("id, result")
    .eq("company_id", companyId)
    .eq("visit_type", "trial")
    .is("deleted_at", null)
    .is("follow_up_at", null)
    .gte("visited_on", since60)
    .lte("visited_on", followDueBefore);
  if (scopeIds) followQ = followQ.in("store_id", scopeIds);

  const [{ data: monthRows }, { data: followRows }] = await Promise.all([monthQ, followQ]);
  const rows = (monthRows ?? []) as Row[];
  const trials = rows.filter((v) => v.visit_type === "trial");
  const joins = trials.filter((v) => v.result === "join");
  const followDue = ((followRows ?? []) as Row[]).filter((v) => v.result !== "join").length;
  const recent = rows.slice(0, 8);

  const tiles: Array<{ label: string; value: string; tone?: string; href?: string; hint?: string }> = [
    { label: `体験（${label}）`, value: String(trials.length) },
    { label: `入会（${label}）`, value: String(joins.length), tone: "text-emerald-600" },
    { label: "体験→入会率", value: rate(joins.length, trials.length), tone: "text-(--color-accent)" },
    { label: "要フォロー", value: String(followDue), tone: followDue > 0 ? "text-rose-600" : undefined, href: "/follow", hint: "体験から7日以上・未入会" },
  ];

  return (
    <div className="space-y-5">
      <header className="reveal">
        <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="mt-0.5 text-sm text-(--color-dim)">今月の体験・入会と、フォローが必要なお客様</p>
      </header>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => {
          const body = (
            <div className="hud reveal h-full rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
              <p className="text-sm font-medium text-(--color-dim)">{t.label}</p>
              <p className={`mt-1 text-3xl font-bold tabular-nums ${t.tone ?? ""}`}>{t.value}</p>
              {t.hint ? <p className="mt-0.5 text-xs text-(--color-dim)">{t.hint}</p> : null}
            </div>
          );
          return t.href ? <Link key={t.label} href={t.href}>{body}</Link> : <div key={t.label}>{body}</div>;
        })}
      </div>
      <Panel title="最近の来店" className="d1">
        {recent.length === 0 ? (
          <p className="text-sm text-(--color-dim)">今月の来店はまだありません。受付台帳から登録できます。</p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((v, i) => {
              const g = (v.mbr_guests ?? null) as { name?: string } | null;
              return (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-(--color-dim)">{md(v.visited_on)}</span>
                    <span className="font-semibold">{g?.name ? String(g.name) : "（氏名未入力）"}</span>
                    <span className="text-xs text-(--color-dim)">{VISIT_TYPE_LABEL[String(v.visit_type)] ?? String(v.visit_type)}</span>
                  </div>
                  {v.result === "join" ? <span className="text-xs font-bold text-emerald-600">入会</span> :
                   v.result === "purchase" ? <span className="text-xs font-bold text-(--color-gold)">購入</span> : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="rounded-lg border border-(--color-line) bg-(--color-panel) px-4 py-2 text-sm font-medium hover:border-(--color-accent)">受付台帳をひらく</Link>
        <Link href="/follow" className="rounded-lg border border-(--color-line) bg-(--color-panel) px-4 py-2 text-sm font-medium hover:border-(--color-accent)">体験フォローをひらく</Link>
        <Link href="/search" className="rounded-lg border border-(--color-line) bg-(--color-panel) px-4 py-2 text-sm font-medium hover:border-(--color-accent)">来店検索をひらく</Link>
      </div>
    </div>
  );
}
